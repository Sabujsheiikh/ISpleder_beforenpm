// This service replaces Electron IPC with WebView2 PostMessage
// C# listens to "window.chrome.webview.postMessage"

export const isWebView2 = () => !!(window as any).chrome?.webview;

export const sendToHost = (action: string, payload: any = {}) => {
    if (isWebView2()) {
        try {
            (window as any).chrome.webview.postMessage(JSON.stringify({ action, payload }));
        } catch (e) {
            console.warn('sendToHost failed', e);
        }
    } else {
        console.warn('Not running in WebView2:', action, payload);
    }
};

// Event Listener for messages coming FROM C#
export const onMessageFromHost = (callback: (data: any) => void) => {
    if (isWebView2()) {
        (window as any).chrome.webview.addEventListener('message', (event: any) => {
            callback(event.data);
        });
    }
};