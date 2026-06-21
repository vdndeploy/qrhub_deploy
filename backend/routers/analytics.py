"""Analytics tracking + reporting routes.

Extracted from server.py (Feb 2026 modular refactor).
Endpoints handled:
- POST   /api/analytics                   client-side event tracking (no auth)
- GET    /api/analytics/detailed          aggregated dashboard data (admin)
- GET    /api/vendor/analytics/detailed   same for vendor's own data
- GET    /api/analytics/export/pdf        PDF export (admin)
- GET    /api/vendor/analytics/export/pdf PDF export for vendor
- GET    /api/analytics/overview          quick overview stats (admin)
"""
import ipaddress
import os
from datetime import datetime, timezone, timedelta
from io import BytesIO
from typing import Optional
from zoneinfo import ZoneInfo

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse, Response as FastAPIResponse
from user_agents import parse as parse_ua

# Reportlab — used for PDF analytics export.
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib.enums import TA_CENTER  # noqa: F401  (kept for future tweaks)
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
)

# Late-binding from server (loaded last).
from server import (
    db, logger,
    get_current_user, get_current_vendor,
    _is_super_admin, _tenant_filter,
    _resolve_vendor_doc,
    AnalyticsEvent,
    CLICK_TYPES,
)

router = APIRouter(tags=['analytics'])

@router.post('/analytics')
async def track_event(event: AnalyticsEvent, request: Request):
    # Extract client IP only for geo lookup — NEVER stored
    ip = request.headers.get('x-forwarded-for', '')
    if ip:
        ip = ip.split(',')[0].strip()
    else:
        ip = request.client.host if request.client else ''
    
    ua_string = request.headers.get('user-agent', '')
    device_type = 'unknown'
    os_name = ''
    browser_name = ''
    if ua_string:
        try:
            ua = parse_ua(ua_string)
            if ua.is_mobile:
                device_type = 'mobile'
            elif ua.is_tablet:
                device_type = 'tablet'
            elif ua.is_pc:
                device_type = 'desktop'
            elif ua.is_bot:
                device_type = 'bot'
            os_name = f"{ua.os.family} {ua.os.version_string}".strip()
            browser_name = f"{ua.browser.family} {ua.browser.version_string}".strip()
        except Exception:
            pass
    
    # Geo lookup at event-time; only aggregated city/country stored (no IP, no raw UA)
    geo = await _geo_lookup(ip) if ip else {'city': '', 'region': '', 'country': '', 'lat': None, 'lon': None}
    
    # Resolve slug → canonical id so analytics always stores the UUID even if the
    # public landing was accessed via /v/<slug>. Otherwise legacy reports/by-vendor
    # joins would silently break for any vendor using a custom slug.
    canonical_vid = event.vendor_id
    if canonical_vid:
        v = await _resolve_vendor_doc(canonical_vid)
        if v and v.get('id'):
            canonical_vid = v['id']

    # Store-landing events (event_type starts with `store_landing_`) may
    # arrive WITHOUT a vendor_id — they reference a store directly. We
    # accept both shapes and persist whatever is provided. The analytics
    # downstream filter on (vendor_id OR store_id) accordingly.
    store_id_val = (event.store_id or '').strip()
    is_store_event = (event.event_type or '').startswith('store_landing_')
    if not canonical_vid and not store_id_val and not is_store_event:
        # Legacy guard: a normal click event with neither id is invalid.
        # We don't raise to keep the endpoint forgiving, but we skip writes.
        return {'message': 'Event ignored — no vendor/store id'}

    event_doc = {
        'vendor_id': canonical_vid or '',
        'event_type': event.event_type,
        'timestamp': event.timestamp or datetime.now(timezone.utc).isoformat(),
        'device': device_type,
        'os': os_name,
        'browser': browser_name,
        'city': geo.get('city', ''),
        'region': geo.get('region', ''),
        'country': geo.get('country', '')
    }
    if store_id_val:
        event_doc['store_id'] = store_id_val
    await db.analytics.insert_one(event_doc)
    return {'message': 'Event tracked'}


def _ip_to_subnet(ip: str) -> str:
    """Anonymize an IP address to a subnet network string so it can be used as a
    cache key without being personal data. IPv4 → /24, IPv6 → /48.
    Returns '' if the input is not a valid IP."""
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return ''
    if isinstance(addr, ipaddress.IPv4Address):
        return str(ipaddress.ip_network(f'{ip}/24', strict=False))
    return str(ipaddress.ip_network(f'{ip}/48', strict=False))


async def _geo_lookup(ip: str) -> dict:
    """Lookup IP geolocation with caching, GDPR-compliant.

    The full IP is used only transiently to call the geocoding provider (ipapi.co),
    then immediately discarded. The cache key is the IP truncated to a subnet
    (IPv4 /24, IPv6 /48) so no individual IP is ever persisted. Multiple users in
    the same subnet share the same cache row, which keeps geolocation precision
    at the city level (the only level we need) while making the stored value
    NOT personal data per art. 4(1) GDPR.
    """
    if not ip or ip in ('127.0.0.1', 'localhost', '::1') or ip.startswith('192.168.') or ip.startswith('10.'):
        return {'city': '', 'region': '', 'country': '', 'lat': None, 'lon': None}

    subnet = _ip_to_subnet(ip)
    if not subnet:
        return {'city': '', 'region': '', 'country': '', 'lat': None, 'lon': None}

    cached = await db.geo_cache.find_one({'subnet': subnet}, {'_id': 0})
    if cached:
        return {'city': cached.get('city', ''), 'region': cached.get('region', ''),
                'country': cached.get('country', ''), 'lat': cached.get('lat'), 'lon': cached.get('lon')}

    try:
        async with httpx.AsyncClient(timeout=3.0) as c:
            r = await c.get(f'https://ipapi.co/{ip}/json/')
            if r.status_code == 200:
                d = r.json()
                geo = {
                    'subnet': subnet,
                    'city': d.get('city', '') or '',
                    'region': d.get('region', '') or '',
                    'country': d.get('country_name', '') or '',
                    'lat': d.get('latitude'),
                    'lon': d.get('longitude'),
                    'cached_at': datetime.now(timezone.utc).isoformat()
                }
                await db.geo_cache.update_one({'subnet': subnet}, {'$set': geo}, upsert=True)
                return {k: geo[k] for k in ('city', 'region', 'country', 'lat', 'lon')}
    except Exception as e:
        logger.warning(f'Geo lookup failed for {ip}: {e}')
    return {'city': '', 'region': '', 'country': '', 'lat': None, 'lon': None}


def _period_to_dates(period: str):
    """Resolve a period label to (start_iso, end_iso) in UTC.

    Calendar day boundaries (today/yesterday) follow Europe/Rome to match the
    in-store team's mental model: a 23:30 italian scan belongs to today, not
    the next UTC day.
    """
    LOCAL_TZ = ZoneInfo('Europe/Rome')
    now_utc = datetime.now(timezone.utc)
    now_local = now_utc.astimezone(LOCAL_TZ)
    if period == 'today':
        start_local = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
        return start_local.astimezone(timezone.utc).isoformat(), now_utc.isoformat()
    if period == 'yesterday':
        end_local = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
        start_local = end_local - timedelta(days=1)
        return (start_local.astimezone(timezone.utc).isoformat(),
                end_local.astimezone(timezone.utc).isoformat())
    if period == '7d':
        start = now_utc - timedelta(days=7)
    elif period == 'month':
        start_local = now_local.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        return start_local.astimezone(timezone.utc).isoformat(), now_utc.isoformat()
    else:  # 30d default
        start = now_utc - timedelta(days=30)
    return start.isoformat(), now_utc.isoformat()


async def _build_detailed_analytics(query_filter: dict, period: str, limit_log: int = 200) -> dict:
    start_iso, end_iso = _period_to_dates(period)
    base = {**query_filter, 'timestamp': {'$gte': start_iso, '$lte': end_iso}}
    
    events = await db.analytics.find(base, {'_id': 0}).sort('timestamp', -1).to_list(5000)
    
    # Aggregations — geo data is now stored at event-time (no IP lookup needed)
    total_views = sum(1 for e in events if e['event_type'] == 'page_view')
    total_clicks = sum(1 for e in events if e['event_type'] in CLICK_TYPES)
    
    click_breakdown = {ct: 0 for ct in CLICK_TYPES}
    device_breakdown = {}
    city_breakdown = {}
    daily_timeline = {}
    hourly_pattern = [0] * 24
    
    # All analytics aggregations show local time to the org admin. Timestamps
    # are stored in UTC by the tracker; we convert them to Europe/Rome (the
    # business timezone of all current orgs) for both the daily timeline and
    # the 24h hourly pattern. Otherwise a customer scanning at 13:30 IT would
    # appear as 11:30 in the chart (CEST is UTC+2).
    LOCAL_TZ = ZoneInfo('Europe/Rome')

    for e in events:
        et = e['event_type']
        if et in click_breakdown:
            click_breakdown[et] += 1
        dev = e.get('device', 'unknown')
        device_breakdown[dev] = device_breakdown.get(dev, 0) + 1
        city = e.get('city') or 'Sconosciuta'
        if et in CLICK_TYPES or et == 'page_view':
            city_breakdown[city] = city_breakdown.get(city, 0) + 1
        ts = e.get('timestamp', '')
        if ts:
            try:
                dt = datetime.fromisoformat(ts.replace('Z', '+00:00'))
                # Naive timestamps default to UTC; aware ones get converted.
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                dt_local = dt.astimezone(LOCAL_TZ)
                day = dt_local.date().isoformat()
                daily_timeline[day] = daily_timeline.get(day, {'views': 0, 'clicks': 0})
                if et == 'page_view':
                    daily_timeline[day]['views'] += 1
                elif et in CLICK_TYPES:
                    daily_timeline[day]['clicks'] += 1
                hourly_pattern[dt_local.hour] += 1
            except Exception:
                pass
    
    timeline_list = sorted(
        [{'date': k, **v} for k, v in daily_timeline.items()],
        key=lambda x: x['date']
    )
    top_cities = sorted(
        [{'city': k, 'count': v} for k, v in city_breakdown.items()],
        key=lambda x: x['count'], reverse=True
    )[:10]
    
    # Recent event log (limited) — NO IP / user-agent stored or returned
    log = []
    for e in events[:limit_log]:
        log.append({
            'timestamp': e.get('timestamp', ''),
            'event_type': e.get('event_type', ''),
            'vendor_id': e.get('vendor_id', ''),
            'city': e.get('city', ''),
            'region': e.get('region', ''),
            'country': e.get('country', ''),
            'device': e.get('device', ''),
            'os': e.get('os', ''),
            'browser': e.get('browser', '')
        })
    
    return {
        'period': period,
        'start': start_iso,
        'end': end_iso,
        'total_events': len(events),
        'total_views': total_views,
        'total_clicks': total_clicks,
        'click_breakdown': click_breakdown,
        'device_breakdown': device_breakdown,
        'top_cities': top_cities,
        'timeline': timeline_list,
        'hourly_pattern': hourly_pattern,
        'event_log': log
    }


@router.get('/analytics/detailed')
async def get_detailed_analytics(period: str = '30d', vendor_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    qf = {'vendor_id': vendor_id} if vendor_id else {}
    if not _is_super_admin(user):
        # Restrict to vendors of user's organization
        org_vendor_ids = [v['id'] for v in await db.vendors.find(
            {'organization_id': user.get('organization_id')}, {'_id': 0, 'id': 1}
        ).to_list(10000)]
        if vendor_id and vendor_id not in org_vendor_ids:
            raise HTTPException(status_code=404, detail='Vendor non trovato')
        if not vendor_id:
            qf = {'vendor_id': {'$in': org_vendor_ids}}
    return await _build_detailed_analytics(qf, period)


@router.get('/vendor/analytics/detailed')
async def get_vendor_detailed_analytics(period: str = '30d', vendor: dict = Depends(get_current_vendor)):
    return await _build_detailed_analytics({'vendor_id': vendor['id']}, period)


def _click_label(et: str) -> str:
    return {
        'whatsapp_click': 'WhatsApp', 'instagram_click': 'Instagram',
        'facebook_click': 'Facebook', 'review_click': 'Recensione Google',
        'tiktok_click': 'TikTok', 'maps_click': 'Google Maps', 'post_cta_click': 'CTA Post'
    }.get(et, et)


def _generate_pdf_report(data: dict, title: str, subtitle: str = '') -> bytes:
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=1.5*cm, bottomMargin=1.5*cm,
                             leftMargin=1.5*cm, rightMargin=1.5*cm, title=title)
    styles = getSampleStyleSheet()
    story = []
    
    h1 = ParagraphStyle('h1', parent=styles['Heading1'], textColor=colors.HexColor('#F96815'),
                          fontSize=24, alignment=TA_CENTER, spaceAfter=6)
    h_sub = ParagraphStyle('hsub', parent=styles['Normal'], fontSize=11,
                            textColor=colors.HexColor('#666666'), alignment=TA_CENTER, spaceAfter=18)
    h2 = ParagraphStyle('h2', parent=styles['Heading2'], textColor=colors.HexColor('#1A1A1A'),
                          fontSize=14, spaceAfter=8, spaceBefore=12)
    
    story.append(Paragraph('Report Analytics', h1))
    story.append(Paragraph(title, h_sub))
    if subtitle:
        story.append(Paragraph(subtitle, h_sub))
    story.append(Paragraph(f"Periodo: {data['start'][:10]} → {data['end'][:10]}", styles['Normal']))
    story.append(Spacer(1, 0.4*cm))
    
    # KPI table
    kpi_data = [
        ['Metrica', 'Valore'],
        ['Visite Totali', str(data.get('total_views', 0))],
        ['Click Totali', str(data.get('total_clicks', 0))],
        ['Eventi Totali', str(data.get('total_events', 0))]
    ]
    t = Table(kpi_data, colWidths=[8*cm, 6*cm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#F96815')),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cccccc')),
        ('PADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(Paragraph('Riepilogo', h2))
    story.append(t)
    
    # Click breakdown
    cb = data.get('click_breakdown', {})
    if any(cb.values()):
        story.append(Paragraph('Dettaglio Click per Canale', h2))
        cb_rows = [['Canale', 'Click']]
        for et, n in cb.items():
            if n > 0:
                cb_rows.append([_click_label(et), str(n)])
        t2 = Table(cb_rows, colWidths=[8*cm, 6*cm])
        t2.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#4A2D8C')),
            ('TEXTCOLOR', (0,0), (-1,0), colors.white),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cccccc')),
            ('PADDING', (0,0), (-1,-1), 6),
        ]))
        story.append(t2)
    
    # Device
    db_ = data.get('device_breakdown', {})
    if db_:
        story.append(Paragraph('Dispositivi', h2))
        rows = [['Tipo', 'Eventi']] + [[k.capitalize(), str(v)] for k, v in db_.items()]
        t3 = Table(rows, colWidths=[8*cm, 6*cm])
        t3.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1A1A1A')),
            ('TEXTCOLOR', (0,0), (-1,0), colors.white),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cccccc')),
            ('PADDING', (0,0), (-1,-1), 6),
        ]))
        story.append(t3)
    
    # Top cities
    tc = data.get('top_cities', [])
    if tc:
        story.append(Paragraph('Top Città (Geolocalizzazione IP)', h2))
        rows = [['Città', 'Eventi']] + [[c['city'], str(c['count'])] for c in tc]
        t4 = Table(rows, colWidths=[8*cm, 6*cm])
        t4.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#F96815')),
            ('TEXTCOLOR', (0,0), (-1,0), colors.white),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cccccc')),
            ('PADDING', (0,0), (-1,-1), 6),
        ]))
        story.append(t4)
    
    # Event log (last 30) — converted to Europe/Rome local time
    log = data.get('event_log', [])[:30]
    if log:
        story.append(PageBreak())
        story.append(Paragraph('Log Eventi Recenti (max 30)', h2))
        rows = [['Data/Ora', 'Evento', 'Città', 'Dispositivo']]
        for e in log:
            ts_raw = e.get('timestamp', '') or ''
            ts = ts_raw[:16].replace('T', ' ')  # safe fallback
            try:
                dt = datetime.fromisoformat(ts_raw.replace('Z', '+00:00'))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                ts = dt.astimezone(ZoneInfo('Europe/Rome')).strftime('%d/%m/%Y %H:%M')
            except Exception:
                pass
            rows.append([ts, _click_label(e.get('event_type', '')),
                          e.get('city', '') or '-', (e.get('device', '') or '-').capitalize()])
        t5 = Table(rows, colWidths=[4*cm, 4.5*cm, 4*cm, 3*cm])
        t5.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#4A2D8C')),
            ('TEXTCOLOR', (0,0), (-1,0), colors.white),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('FONTSIZE', (0,0), (-1,-1), 8),
            ('GRID', (0,0), (-1,-1), 0.3, colors.HexColor('#cccccc')),
            ('PADDING', (0,0), (-1,-1), 4),
        ]))
        story.append(t5)
    
    story.append(Spacer(1, 0.6*cm))
    footer = ParagraphStyle('foot', parent=styles['Normal'], fontSize=8, alignment=TA_CENTER, textColor=colors.HexColor('#999999'))
    story.append(Paragraph(
        f"Report generato il {datetime.now(ZoneInfo('Europe/Rome')).strftime('%d/%m/%Y %H:%M')} (ora Italia) — QRHub",
        footer,
    ))
    
    doc.build(story)
    return buf.getvalue()


@router.get('/analytics/export/pdf')
async def export_analytics_pdf(period: str = '30d', vendor_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    # Tenant scoping (defense-in-depth): a non-super-admin must NOT be able to
    # request analytics of a vendor outside their own organization, nor an
    # unscoped "all vendors" report. Mirrors the logic of /analytics/detailed.
    if not _is_super_admin(user):
        org_vendor_ids = [v['id'] for v in await db.vendors.find(
            {'organization_id': user.get('organization_id')}, {'_id': 0, 'id': 1}
        ).to_list(10000)]
        if vendor_id and vendor_id not in org_vendor_ids:
            raise HTTPException(status_code=404, detail='Vendor non trovato')
        if vendor_id:
            qf = {'vendor_id': vendor_id}
        else:
            qf = {'vendor_id': {'$in': org_vendor_ids}}
    else:
        qf = {'vendor_id': vendor_id} if vendor_id else {}

    data = await _build_detailed_analytics(qf, period)
    
    title = 'Report Analytics'
    subtitle = ''
    if vendor_id:
        v = await db.vendors.find_one({'id': vendor_id}, {'_id': 0, 'name': 1})
        if v:
            subtitle = f"Venditore: {v['name']}"
            title = f"Report Analytics - {v['name']}"
    else:
        subtitle = 'Tutti i venditori'
    
    pdf_bytes = _generate_pdf_report(data, title, subtitle)
    fname = f"analytics_{period}_{datetime.now(timezone.utc).strftime('%Y%m%d')}.pdf"
    return FastAPIResponse(content=pdf_bytes, media_type='application/pdf',
                              headers={'Content-Disposition': f'attachment; filename={fname}'})


@router.get('/vendor/analytics/export/pdf')
async def export_vendor_analytics_pdf(period: str = '30d', vendor: dict = Depends(get_current_vendor)):
    data = await _build_detailed_analytics({'vendor_id': vendor['id']}, period)
    title = f"Report Analytics - {vendor['name']}"
    pdf_bytes = _generate_pdf_report(data, title, f"Venditore: {vendor['name']}")
    fname = f"analytics_{period}_{datetime.now(timezone.utc).strftime('%Y%m%d')}.pdf"
    return FastAPIResponse(content=pdf_bytes, media_type='application/pdf',
                              headers={'Content-Disposition': f'attachment; filename={fname}'})

@router.get('/analytics/store-landings')
async def get_store_landings_analytics(period: str = '7d', user: dict = Depends(get_current_user)):
    """Per-store funnel KPIs for the /s/:slug lead-gen landings.

    Returns:
      - global KPIs (views, whatsapp/cta clicks, conversion %, bounce %)
      - per-store table (name, slug, views, clicks, CR%, bounce%)
      - funnel breakdown (view → engaged → click → form_view)
    """
    start_iso, end_iso = _period_to_dates(period)
    ts_match = {'$gte': start_iso, '$lt': end_iso}

    # Tenant scoping: org-admin sees only own stores; super-admin sees all.
    store_filter = {} if _is_super_admin(user) else {
        'organization_id': user.get('organization_id'),
    }
    stores = await db.stores.find(
        store_filter,
        {'_id': 0, 'id': 1, 'name': 1, 'landing_slug': 1,
         'landing_enabled': 1, 'landing_cta_mode': 1}
    ).to_list(1000)
    store_ids = [s['id'] for s in stores]

    # Base match for landing events scoped to the tenant's stores.
    base_match = {
        'timestamp': ts_match,
        'event_type': {'$regex': '^store_landing_'},
    }
    if store_ids:
        base_match['store_id'] = {'$in': store_ids}
    else:
        # No stores at all → return empty quick.
        return {
            'period': period,
            'totals': {'views': 0, 'cta_clicks': 0, 'review_clicks': 0,
                        'maps_clicks': 0, 'social_clicks': 0, 'form_views': 0,
                        'bounces': 0, 'conversion_rate': 0.0, 'bounce_rate': 0.0},
            'by_store': [],
        }

    # Aggregate by event_type + store_id in one shot.
    cursor = db.analytics.aggregate([
        {'$match': base_match},
        {'$group': {
            '_id': {'store_id': '$store_id', 'event_type': '$event_type'},
            'count': {'$sum': 1},
        }}
    ])
    matrix = {}
    async for row in cursor:
        sid = row['_id'].get('store_id', '') or ''
        et = row['_id'].get('event_type', '')
        if not sid:
            continue
        matrix.setdefault(sid, {})
        matrix[sid][et] = row['count']

    by_store = []
    totals = {
        'views': 0, 'cta_clicks': 0, 'review_clicks': 0,
        'maps_clicks': 0, 'social_clicks': 0, 'form_views': 0,
        'bounces': 0,
    }
    for s in stores:
        cells = matrix.get(s['id'], {})
        views = cells.get('store_landing_view', 0)
        cta = cells.get('store_landing_whatsapp_click', 0)
        rev = cells.get('store_landing_review_click', 0)
        maps_ = cells.get('store_landing_maps_click', 0)
        soc = cells.get('store_landing_social_click', 0)
        form = cells.get('store_landing_form_view', 0)
        bounce = cells.get('store_landing_bounce', 0)
        cr = round(((cta + form) / views * 100), 1) if views > 0 else 0.0
        br = round((bounce / views * 100), 1) if views > 0 else 0.0
        by_store.append({
            'id': s['id'],
            'name': s.get('name', ''),
            'slug': s.get('landing_slug', ''),
            'enabled': bool(s.get('landing_enabled', False)),
            'cta_mode': s.get('landing_cta_mode', 'whatsapp'),
            'views': views,
            'cta_clicks': cta,
            'review_clicks': rev,
            'maps_clicks': maps_,
            'social_clicks': soc,
            'form_views': form,
            'bounces': bounce,
            'conversion_rate': cr,
            'bounce_rate': br,
        })
        totals['views'] += views
        totals['cta_clicks'] += cta
        totals['review_clicks'] += rev
        totals['maps_clicks'] += maps_
        totals['social_clicks'] += soc
        totals['form_views'] += form
        totals['bounces'] += bounce

    totals['conversion_rate'] = (
        round(((totals['cta_clicks'] + totals['form_views']) / totals['views'] * 100), 1)
        if totals['views'] > 0 else 0.0
    )
    totals['bounce_rate'] = (
        round((totals['bounces'] / totals['views'] * 100), 1)
        if totals['views'] > 0 else 0.0
    )
    # Sort descending by conversion rate then views for a "top performers" feel.
    by_store.sort(key=lambda r: (r['conversion_rate'], r['views']), reverse=True)
    return {'period': period, 'totals': totals, 'by_store': by_store}


@router.get('/analytics/overview')
async def get_analytics_overview(user: dict = Depends(get_current_user)):
    qf = _tenant_filter(user)
    total_vendors = await db.vendors.count_documents(qf)
    
    org_vendor_ids = [v['id'] for v in await db.vendors.find(qf, {'_id': 0, 'id': 1}).to_list(10000)]
    analytics_qf = {} if _is_super_admin(user) else {'vendor_id': {'$in': org_vendor_ids}}
    
    total_views = await db.analytics.count_documents({**analytics_qf, 'event_type': 'page_view'})
    total_clicks = await db.analytics.count_documents({**analytics_qf, 'event_type': {'$in': CLICK_TYPES}})
    
    vendors = await db.vendors.find(qf, {'_id': 0, 'id': 1, 'name': 1}).to_list(1000)
    vendor_stats = []
    for v in vendors:
        views = await db.analytics.count_documents({'vendor_id': v['id'], 'event_type': 'page_view'})
        clicks = await db.analytics.count_documents({
            'vendor_id': v['id'],
            'event_type': {'$in': CLICK_TYPES}
        })
        vendor_stats.append({
            'id': v['id'],
            'name': v['name'],
            'views': views,
            'clicks': clicks
        })
    
    return {
        'total_vendors': total_vendors,
        'total_views': total_views,
        'total_clicks': total_clicks,
        'vendor_stats': vendor_stats
    }



@router.get('/analytics/daily-counter')
async def get_daily_counter(
    store_id: Optional[str] = None,
    days: int = 30,
    offset_days: int = 0,
    user: dict = Depends(get_current_user),
):
    """Daily counter KPI — scans (QR page_view) and WhatsApp clicks aggregated
    by day, optionally filtered by store. Used in the dashboard as an
    in-store "people counter": each scan ≈ a customer interaction, each
    WhatsApp click ≈ a conversation started.

    `offset_days`: shift the window back by N calendar days. Combined with
    `days=1&offset_days=1` yields the "Ieri" view (yesterday's hourly chart).

    Returns: { series: [{date, scans, whatsapp}], totals: {scans, whatsapp},
               stores: [{id, name}] }
    """
    days = max(1, min(int(days or 30), 180))
    offset_days = max(0, min(int(offset_days or 0), 365))
    tz_utc = timezone.utc
    today = datetime.now(tz_utc).date()
    # Window: last day inclusive = today - offset_days. First day = last - (days-1).
    end_date = today - timedelta(days=offset_days)
    start_date = end_date - timedelta(days=days - 1)
    start_iso = datetime(start_date.year, start_date.month, start_date.day,
                          tzinfo=tz_utc).isoformat()
    # Exclusive upper bound: start of (end_date + 1).
    end_excl = end_date + timedelta(days=1)
    end_iso = datetime(end_excl.year, end_excl.month, end_excl.day,
                       tzinfo=tz_utc).isoformat()

    # Build vendor scope: tenant first, then optional store filter.
    vendor_filter = _tenant_filter(user)
    if store_id:
        # Validate the store belongs to the user's tenant (super admin is
        # unrestricted by _tenant_filter).
        store_check = await db.stores.find_one(
            {'id': store_id, **vendor_filter}, {'_id': 1}
        ) if not _is_super_admin(user) else \
            await db.stores.find_one({'id': store_id}, {'_id': 1})
        if not store_check:
            raise HTTPException(status_code=404, detail='Store not found')
        vendor_filter = {**vendor_filter, 'store_id': store_id}

    vendor_docs = await db.vendors.find(
        vendor_filter, {'_id': 0, 'id': 1}
    ).to_list(10000)
    vendor_ids = [v['id'] for v in vendor_docs]

    # Stores list for the dropdown — always scoped to user's tenant.
    store_docs = await db.stores.find(
        _tenant_filter(user), {'_id': 0, 'id': 1, 'name': 1}
    ).sort('name', 1).to_list(1000)
    stores = [{'id': s['id'], 'name': s.get('name', '')} for s in store_docs]

    # Empty series if no vendors match (e.g. brand-new store).
    series = []
    for i in range(days):
        d = start_date + timedelta(days=i)
        series.append({'date': d.isoformat(), 'scans': 0, 'whatsapp': 0})
    date_index = {row['date']: row for row in series}

    if vendor_ids:
        # Bucket events by Europe/Rome calendar day. Timestamps are stored
        # as ISO strings (UTC); parse them with $dateFromString then format
        # back with the explicit timezone so events past 22:00 UTC of one
        # day correctly count under the NEXT day in Italy.
        pipeline = [
            {'$match': {
                'vendor_id': {'$in': vendor_ids},
                'event_type': {'$in': ['page_view', 'whatsapp_click']},
                'timestamp': {'$gte': start_iso, '$lt': end_iso},
            }},
            {'$group': {
                '_id': {
                    'day': {
                        '$dateToString': {
                            'format': '%Y-%m-%d',
                            'date': {
                                '$dateFromString': {
                                    'dateString': '$timestamp',
                                    'onError': None,
                                }
                            },
                            'timezone': 'Europe/Rome',
                        }
                    },
                    'type': '$event_type',
                },
                'n': {'$sum': 1},
            }},
        ]
        async for row in db.analytics.aggregate(pipeline):
            day = row['_id']['day']
            etype = row['_id']['type']
            n = row['n']
            if day in date_index:
                key = 'scans' if etype == 'page_view' else 'whatsapp'
                date_index[day][key] = n

    totals = {
        'scans': sum(r['scans'] for r in series),
        'whatsapp': sum(r['whatsapp'] for r in series),
    }
    conversion = round((totals['whatsapp'] / totals['scans'] * 100), 1) if totals['scans'] else 0.0

    # When the admin selects "Today" (days=1), the bar chart would collapse
    # to a single bar. Provide an hourly breakdown (24 buckets, local TZ) so
    # the same chart can show the day's pattern instead.
    hourly_series = None
    if days == 1 and vendor_ids:
        hourly_series = [{'hour': h, 'scans': 0, 'whatsapp': 0} for h in range(24)]
        hourly_index = {row['hour']: row for row in hourly_series}
        hour_pipeline = [
            {'$match': {
                'vendor_id': {'$in': vendor_ids},
                'event_type': {'$in': ['page_view', 'whatsapp_click']},
                'timestamp': {'$gte': start_iso, '$lt': end_iso},
            }},
            {'$group': {
                '_id': {
                    'hour': {
                        '$hour': {
                            'date': {
                                '$dateFromString': {
                                    'dateString': '$timestamp',
                                    'onError': None,
                                }
                            },
                            'timezone': 'Europe/Rome',
                        }
                    },
                    'type': '$event_type',
                },
                'n': {'$sum': 1},
            }},
        ]
        async for row in db.analytics.aggregate(hour_pipeline):
            h = row['_id'].get('hour')
            if h is None or h not in hourly_index:
                continue
            etype = row['_id']['type']
            key = 'scans' if etype == 'page_view' else 'whatsapp'
            hourly_index[h][key] = row['n']

    return {
        'series': series,
        'hourly_series': hourly_series,  # populated only when days == 1
        'totals': {**totals, 'conversion_pct': conversion},
        'stores': stores,
        'days': days,
        'store_id': store_id or '',
    }
