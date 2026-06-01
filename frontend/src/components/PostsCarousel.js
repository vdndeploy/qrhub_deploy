import { useEffect, useState } from 'react';
import useEmblaCarousel from 'embla-carousel-react';

/**
 * Adaptive carousel that auto-detects each slide's aspect ratio and adjusts container height.
 * Manual swipe only (no autoplay).
 *
 * Per request: the frame border and the CTA button of each post alternate between
 * `--brand-color` and `--brand-secondary`. We hash post.id with FNV-1a to keep
 * the assignment STABLE across renders (same post always gets the same color).
 */
const hashId = (s) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h;
};

const PostsCarousel = ({ posts = [], whatsappBase = '', onCtaClick, defaultMessage = '' }) => {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false, align: 'start' });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [aspects, setAspects] = useState({});

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelectedIndex(emblaApi.selectedScrollSnap());
    emblaApi.on('select', onSelect);
    onSelect();
    return () => emblaApi.off('select', onSelect);
  }, [emblaApi]);

  if (!posts || posts.length === 0) return null;

  const handleImageLoad = (id, e) => {
    const w = e.target.naturalWidth;
    const h = e.target.naturalHeight;
    if (w && h) setAspects(prev => ({ ...prev, [id]: w / h }));
  };

  const handleVideoMeta = (id, e) => {
    const w = e.target.videoWidth;
    const h = e.target.videoHeight;
    if (w && h) setAspects(prev => ({ ...prev, [id]: w / h }));
  };

  return (
    <div className="posts-carousel-wrap">
      <div className="posts-eyebrow">Annunci del Negozio</div>

      <div className="posts-carousel" ref={emblaRef}>
        <div className="posts-track">
          {posts.map((p) => {
            const ar = aspects[p.id] || p.aspect_ratio || 1;
            const isVideo = p.media_resource_type === 'video' || (p.media_url || '').match(/\.(mp4|webm|mov)$/i);
            const ctaHref = whatsappBase
              ? `${whatsappBase}${p.cta_whatsapp_message || defaultMessage ? `?text=${encodeURIComponent(p.cta_whatsapp_message || defaultMessage)}` : ''}`
              : '#';
            return (
              <div key={p.id} className="posts-slide">
                <div className="posts-card">
                  {p.media_url && (
                    <div className="posts-media-wrap" style={{ aspectRatio: ar }}>
                      {isVideo ? (
                        <video src={p.media_url} controls playsInline preload="metadata"
                                onLoadedMetadata={(e) => handleVideoMeta(p.id, e)} />
                      ) : (
                        <img src={p.media_url} alt={p.title || 'Annuncio'} loading="lazy"
                              onLoad={(e) => handleImageLoad(p.id, e)} />
                      )}
                    </div>
                  )}
                  <div className="posts-content">
                    {p.title && <div className="posts-title">{p.title}</div>}
                    {p.text && <div className="posts-text">{p.text}</div>}
                    {p.cta_text && whatsappBase && (
                      <a className="posts-cta" href={ctaHref} target="_blank" rel="noopener noreferrer"
                          onClick={() => onCtaClick && onCtaClick(p)}
                          style={{ background: accent }}>
                        {p.cta_text}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {posts.length > 1 && (
        <div className="posts-dots">
          {posts.map((_, i) => (
            <button key={i} type="button"
                     className={`posts-dot ${i === selectedIndex ? 'is-active' : ''}`}
                     onClick={() => emblaApi && emblaApi.scrollTo(i)}
                     aria-label={`Vai al post ${i + 1}`} />
          ))}
        </div>
      )}
    </div>
  );
};

export default PostsCarousel;
