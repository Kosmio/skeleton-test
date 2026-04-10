import React, { useState, useRef, useEffect } from "react";

type Props = {
  strapiUrl: string;
};

const LIMITS = { name: 200, subject: 500, message: 10000 };

function CharCount({ value, max }: { value: string; max: number }) {
  const remaining = max - value.length;
  const warn = remaining < max * 0.1;
  return (
    <span className={`text-xs ${warn ? "text-orange-500" : "text-gray-400"}`}>
      {value.length}/{max}
    </span>
  );
}

export default function ContactForm({ strapiUrl }: Props) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [altchaToken, setAltchaToken] = useState<string>("");
  const altchaRef = useRef<HTMLElement>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });

  useEffect(() => {
    import("altcha");
  }, []);

  useEffect(() => {
    const widget = altchaRef.current;
    if (!widget) return;

    const handleStateChange = (ev: any) => {
      if (ev.detail?.state === "verified" && ev.detail?.payload) {
        setAltchaToken(ev.detail.payload);
      }
    };

    widget.addEventListener("statechange", handleStateChange);
    return () => widget.removeEventListener("statechange", handleStateChange);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setErrorMessage("");

    try {
      const response = await fetch(`${strapiUrl}/api/contact/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          captchaToken: altchaToken,
        }),
      });

      if (response.ok) {
        setStatus("success");
        setFormData({ name: "", email: "", subject: "", message: "" });
        setAltchaToken("");
        (altchaRef.current as any)?.reset?.();
      } else {
        const data = await response.json().catch(() => null);
        setErrorMessage(data?.message || "Une erreur est survenue. Veuillez réessayer.");
        setStatus("error");
        (altchaRef.current as any)?.reset?.();
        setAltchaToken("");
      }
    } catch {
      setErrorMessage("Une erreur est survenue. Veuillez réessayer.");
      setStatus("error");
      (altchaRef.current as any)?.reset?.();
      setAltchaToken("");
    }
  };

  const inputClass = "w-full px-4 py-3 bg-[#f8fafc] border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#1e40af]/20 focus:border-[#1e40af] outline-none transition-colors";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <div className="flex justify-between items-baseline mb-1.5">
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
              Nom
            </label>
            <CharCount value={formData.name} max={LIMITS.name} />
          </div>
          <input
            type="text"
            id="name"
            name="name"
            required
            maxLength={LIMITS.name}
            value={formData.name}
            onChange={handleChange}
            className={inputClass}
            placeholder="Votre nom"
          />
        </div>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
            Email
          </label>
          <input
            type="email"
            id="email"
            name="email"
            required
            maxLength={254}
            value={formData.email}
            onChange={handleChange}
            className={inputClass}
            placeholder="votre@email.com"
          />
        </div>
      </div>
      <div>
        <div className="flex justify-between items-baseline mb-1.5">
          <label htmlFor="subject" className="block text-sm font-medium text-gray-700">
            Sujet
          </label>
          <CharCount value={formData.subject} max={LIMITS.subject} />
        </div>
        <input
          type="text"
          id="subject"
          name="subject"
          maxLength={LIMITS.subject}
          value={formData.subject}
          onChange={handleChange}
          className={inputClass}
          placeholder="L'objet de votre message"
        />
      </div>
      <div>
        <div className="flex justify-between items-baseline mb-1.5">
          <label htmlFor="message" className="block text-sm font-medium text-gray-700">
            Message
          </label>
          <CharCount value={formData.message} max={LIMITS.message} />
        </div>
        <textarea
          id="message"
          name="message"
          required
          rows={6}
          maxLength={LIMITS.message}
          value={formData.message}
          onChange={handleChange}
          className={`${inputClass} resize-vertical`}
          placeholder="Décrivez votre projet ou votre question..."
        />
      </div>

      <div>
        {/* @ts-ignore — altcha-widget is a web component */}
        <altcha-widget
          ref={altchaRef}
          challengeurl={`${strapiUrl}/api/captcha/challenge`}
          auto="onfocus"
          hidefooter
          suppressHydrationWarning
          style={{ maxWidth: "100%" } as any}
        />
      </div>

      {status === "success" && (
        <div role="alert" className="flex items-center gap-3 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg text-sm">
          <svg className="w-5 h-5 flex-shrink-0" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          Votre message a bien été envoyé. Nous reviendrons vers vous rapidement.
        </div>
      )}
      {status === "error" && (
        <div role="alert" className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
          <svg className="w-5 h-5 flex-shrink-0" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          {errorMessage}
        </div>
      )}

      <p className="text-xs text-gray-500">
        En soumettant ce formulaire, vous acceptez que vos données soient utilisées pour répondre à votre demande.{" "}
        <a href="/politique-de-confidentialite" className="underline hover:text-gray-700">Politique de confidentialité</a>
      </p>

      <button
        type="submit"
        disabled={status === "loading"}
        className={`w-full sm:w-auto px-8 py-3 rounded-lg font-semibold text-sm text-white transition-colors ${
          status === "loading"
            ? "bg-gray-400 cursor-not-allowed"
            : "bg-[#1e40af] hover:bg-[#1e3a8a]"
        }`}
      >
        {status === "loading" ? "Envoi en cours..." : "Envoyer le message"}
      </button>
    </form>
  );
}
