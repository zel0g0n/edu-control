// Server va klient uchun umumiy (layout.tsx server komponentida ishlatiladi).
export const THEME_KEY = "edunazorat-theme";
export const THEME_COLORS: Record<"light" | "dark", string> = { light: "#f5f4ef", dark: "#0f1221" };

/**
 * Sahifa chizilishidan oldin <head> da ishlaydi (oq-qora miltillash bo'lmasin).
 * lib/theme.ts dagi mantiq bilan bir xil bo'lishi kerak.
 */
export const THEME_BOOT_SCRIPT = `(function(){var p;try{p=localStorage.getItem(${JSON.stringify(THEME_KEY)})}catch(e){}var d=p==="dark"||(p!=="light"&&window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light"})()`;

