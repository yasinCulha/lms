/** YouTube IFrame Player API'nin bu projede kullanılan küçük alt kümesi. */
export interface YouTubePlayer {
  getPlayerState(): number;
}

interface YouTubeNamespace {
  Player: new (
    element: HTMLIFrameElement,
    options: { events: { onStateChange?: (event: { data: number }) => void } },
  ) => YouTubePlayer;
  PlayerState: { ENDED: number; PLAYING: number };
}

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YouTubeNamespace> | null = null;

/** API betiğini bir kez yükler; ağ hatasında sonraki çağrı yeniden dener. */
export function loadYouTubeApi(): Promise<YouTubeNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        if (window.YT) resolve(window.YT);
      };
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => {
        apiPromise = null;
        script.remove();
        reject(new Error('YouTube API yüklenemedi.'));
      };
      document.head.appendChild(script);
    });
  }
  return apiPromise;
}
