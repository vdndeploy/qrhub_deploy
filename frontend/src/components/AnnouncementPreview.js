import { Eye } from 'lucide-react';

/**
 * AnnouncementPreview — renders an exact replica of how the post will look
 * inside the visitor's vendor landing carousel. Uses the same DOM/CSS classes
 * as PostsCarousel (.posts-card / .posts-title / etc) so it inherits the
 * organization's brand color and font.
 *
 * Props mirror the form fields. `whatsappAvailable` toggles the CTA button —
 * on the real landing it only shows when vendor.whatsapp is set.
 */
const AnnouncementPreview = ({ form, whatsappAvailable = true }) => {
  const {
    title, text, media_url, media_resource_type,
    aspect_ratio, cta_text,
  } = form || {};

  const isVideo = media_resource_type === 'video' ||
    (media_url || '').match(/\.(mp4|webm|mov)$/i);
  const ar = aspect_ratio || 1;
  const hasContent = title || text || media_url || cta_text;

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-gradient-to-b from-gray-50 to-white dark:from-[#0a0a0b] dark:to-[#131316] p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-semibold text-gray-500 dark:text-[#8a8a92] mb-2">
        <Eye className="h-3 w-3" />
        Anteprima · Come la vedrà il cliente
      </div>

      {/* Phone-frame mock to make the preview obviously a "mockup" */}
      <div className="mx-auto" style={{ maxWidth: 340 }} data-testid="post-preview-frame">
        <div className="rounded-[28px] border-[10px] border-gray-800 bg-white dark:bg-[#0a0a0b] shadow-xl overflow-hidden">
          <div className="bg-gray-800 h-5 flex items-center justify-center">
            <div className="w-16 h-1 rounded-full bg-gray-700" />
          </div>
          <div className="p-3" style={{ fontFamily: "'Source Sans 3', -apple-system, sans-serif" }}>
            <div className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 dark:text-[#6a6a72] mb-2">
              Annunci del Negozio
            </div>
            {!hasContent ? (
              <div className="rounded-xl border border-dashed border-gray-200 dark:border-white/10 py-10 text-center text-xs text-gray-400 dark:text-[#5a5a62]">
                Compila titolo, testo o media per vedere l'anteprima
              </div>
            ) : (
              <div className="rounded-xl bg-white dark:bg-[#131316] border border-gray-100 dark:border-white/10 overflow-hidden shadow-sm">
                {media_url && (
                  <div className="bg-black/5 dark:bg-white/5" style={{ aspectRatio: ar }}>
                    {isVideo ? (
                      <video src={media_url} className="w-full h-full object-cover" muted playsInline />
                    ) : (
                      <img src={media_url} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                )}
                <div className="p-3">
                  {title && (
                    <div className="text-sm font-bold text-gray-900 dark:text-white leading-tight mb-1">
                      {title}
                    </div>
                  )}
                  {text && (
                    <div className="text-xs text-gray-600 dark:text-[#a8a8b0] whitespace-pre-wrap break-words leading-snug">
                      {text}
                    </div>
                  )}
                  {cta_text && whatsappAvailable && (
                    <div
                      className="mt-2.5 inline-flex items-center justify-center w-full px-3 py-2 rounded-lg text-xs font-bold text-white"
                      style={{ background: '#25D366' }}
                    >
                      {cta_text}
                    </div>
                  )}
                  {cta_text && !whatsappAvailable && (
                    <div className="mt-2.5 text-[10px] italic text-amber-600 dark:text-amber-400">
                      ⚠️ Il bottone CTA appare solo per venditori con WhatsApp configurato
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="flex justify-center gap-1 mt-2">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-800" />
              <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
              <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnnouncementPreview;
