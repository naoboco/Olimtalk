// Relay mode, the part that touches the device: remembering which AI application the
// person uses, and handing a request over to it.
import { Share } from '@capacitor/share';
import { IS_NATIVE, openExternal } from '../platform.ts';
import { copyText } from '../share.ts';
import { isAiApp, relayUrl, type AiAppId } from './relay.ts';

const STORAGE_KEY = 'ot_ai_app';

export function loadAiApp(): AiAppId | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return isAiApp(saved) ? saved : null;
  } catch {
    return null;
  }
}

export function saveAiApp(app: AiAppId | null) {
  try {
    if (app) localStorage.setItem(STORAGE_KEY, app);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable: the choice lasts for this visit */
  }
}

/** The phone's share sheet, where every installed AI application appears. */
async function shareText(text: string): Promise<boolean> {
  try {
    if (IS_NATIVE) await Share.share({ text });
    else if (typeof navigator.share === 'function') await navigator.share({ text });
    else return false;
    return true;
  } catch {
    return false; // dismissed, or not available
  }
}

/**
 * Hand a request over to the person's AI application. The request is always copied, so
 * that it can be pasted wherever the application did not pick it up by itself.
 * Must be called straight from a tap or click.
 */
export async function sendToAiApp(app: AiAppId, request: string): Promise<'opened' | 'shared' | 'copied'> {
  // Start copying before anything takes the focus away from this page.
  const copying = copyText(request);
  const url = relayUrl(app, request);
  if (url) {
    void openExternal(url);
    await copying;
    return 'opened';
  }
  await copying;
  return (await shareText(request)) ? 'shared' : 'copied';
}
