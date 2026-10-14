import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { loadYouTubeApi } from '../youtubeApi';
import styles from './YouTubeVideo.module.css';

interface YouTubeVideoProps {
  videoId: string;
  title: string;
  onEnded?: () => void;
  /** Video tekrar oynatılmaya başlarsa (ör. bitişten sonra yeniden izleme). */
  onPlaying?: () => void;
  /** Videonun üstünde gösterilecek katman (ör. sonraki ders geri sayımı). */
  overlay?: ReactNode;
}

export function YouTubeVideo({ videoId, title, onEnded, onPlaying, overlay }: YouTubeVideoProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const handlers = useRef({ onEnded, onPlaying });
  handlers.current = { onEnded, onPlaying };

  useEffect(() => {
    let active = true;
    loadYouTubeApi()
      .then((YT) => {
        if (!active || !iframeRef.current) return;
        // Player mevcut iframe'e bağlanır; destroy() iframe'i DOM'dan sildiği için çağrılmaz,
        // eski olaylar `active` bayrağıyla yok sayılır.
        new YT.Player(iframeRef.current, {
          events: {
            onStateChange: (event) => {
              if (!active) return;
              if (event.data === YT.PlayerState.ENDED) handlers.current.onEnded?.();
              else if (event.data === YT.PlayerState.PLAYING) handlers.current.onPlaying?.();
            },
          },
        });
      })
      .catch(() => {
        // API yoksa video yine oynar; yalnızca otomatik geçiş çalışmaz.
      });
    return () => {
      active = false;
    };
  }, [videoId]);

  const origin = encodeURIComponent(window.location.origin);

  return (
    <div className={styles.wrapper}>
      <iframe
        key={videoId}
        ref={iframeRef}
        className={styles.video}
        src={`https://www.youtube.com/embed/${videoId}?enablejsapi=1&rel=0&origin=${origin}`}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
      {overlay}
    </div>
  );
}
