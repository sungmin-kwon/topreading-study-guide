"use client";

import { useEffect, useState } from "react";
import "./live-workspace.css";
import { ThemeToggle } from "./theme-toggle";

export function AuthScreen({ signedOut = false, error = false, signInAction }: {
  signedOut?: boolean; error?: boolean; signInAction?: () => Promise<void>;
}) {
  const [theme, setTheme] = useState("light");
  const [language, setLanguage] = useState("en");
  const t = (en: string, ko: string) => language === "ko" ? ko : en;
  useEffect(() => {
    const savedTheme = localStorage.getItem("topreading-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(savedTheme); document.documentElement.dataset.theme = savedTheme;
    setLanguage(localStorage.getItem("topreading-ui-language") || (navigator.language.startsWith("ko") ? "ko" : "en"));
  }, []);
  return <main className="reading-shell reading-auth">
    <header className="reading-topbar">
      <a className="reading-brand" href="/">TopReading</a>
      <div className="reading-preferences">
        <ThemeToggle dark={theme === "dark"} label={t("Toggle dark mode", "다크 모드 전환")} text={theme === "dark" ? t("Light", "라이트") : t("Dark", "다크")} onToggle={() => {
          const next = theme === "dark" ? "light" : "dark";
          setTheme(next); document.documentElement.dataset.theme = next; localStorage.setItem("topreading-theme", next);
        }} />
        <select className="reading-language-toggle" aria-label={t("Interface language", "화면 언어")} value={language} onChange={event => {
          setLanguage(event.target.value); localStorage.setItem("topreading-ui-language", event.target.value);
        }}><option value="en">English</option><option value="ko">한국어</option></select>
      </div>
    </header>
    <section className="reading-auth-content" aria-labelledby="auth-title">
      <h1 id="auth-title">{signedOut ? t("Signed out", "로그아웃되었습니다") : t("Sign in to your library", "도서관에 로그인")}</h1>
      {error && <p className="reading-auth-error" role="alert">{t("Sign-in was not completed. Use your invited Google account, or contact your library administrator.", "로그인하지 못했습니다. 초대된 Google 계정을 사용하거나 도서관 관리자에게 문의하세요.")}</p>}
      {signedOut ? <a className="reading-auth-action" href="/">{t("Sign in again", "다시 로그인")}</a> :
        <form action={signInAction}><button className="reading-auth-action" type="submit">{t("Continue with Google", "Google로 계속하기")}</button></form>}
    </section>
  </main>;
}
