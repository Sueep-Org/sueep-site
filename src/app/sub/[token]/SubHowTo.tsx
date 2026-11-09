"use client";

import { tr, type Lang } from "@/lib/erp/language";

/**
 * Short how-to at the bottom of the sub's jobs page, in their language.
 * Staff help for the same flow: src/content/help/workers/sub-portal.tsx.
 */

type Section = { title: { en: string; es: string }; lines: { en: string; es: string }[] };

const SECTIONS: Section[] = [
  {
    title: { en: "Offers", es: "Ofertas" },
    lines: [
      {
        en: "Jobs we'd like you to take, with the address, dates, work and your pay. Answer before the time shown, or the offer closes.",
        es: "Trabajos que queremos que tomes, con la dirección, fechas, trabajo y tu pago. Responde antes de la hora indicada o la oferta se cierra.",
      },
      {
        en: "Accept: tell us how many people you're bringing. You're booked and get the schedule email.",
        es: "Aceptar: dinos cuántas personas traes. Quedas programado y recibes el correo del horario.",
      },
      {
        en: "Decline: pick a reason. If it's the price, we may send it again at a new price.",
        es: "Rechazar: elige una razón. Si es por el precio, puede que te la enviemos de nuevo con otro precio.",
      },
    ],
  },
  {
    title: { en: "Today", es: "Hoy" },
    lines: [
      {
        en: "Tap Check in when you get to the job. Your phone's location is checked only at that moment, never during the day.",
        es: "Toca Registrar entrada cuando llegues al trabajo. La ubicación de tu teléfono se revisa solo en ese momento, nunca durante el día.",
      },
      {
        en: "Take before photos when you start and after photos when you finish, with the camera. If you're running the job, you need the photos asked for before you can check out.",
        es: "Toma fotos de antes al empezar y fotos de después al terminar, con la cámara. Si estás a cargo del trabajo, necesitas las fotos pedidas para poder registrar tu salida.",
      },
      {
        en: "Tap Check out when you leave.",
        es: "Toca Registrar salida cuando te vayas.",
      },
      {
        en: "No signal? Keep going. Taps and photos wait on your phone and send by themselves when signal comes back, with the time you took them.",
        es: "¿Sin señal? Sigue trabajando. Los registros y las fotos esperan en tu teléfono y se envían solos cuando vuelve la señal, con la hora en que los hiciste.",
      },
    ],
  },
  {
    title: { en: "Upcoming", es: "Próximos" },
    lines: [
      {
        en: "Your booked jobs: the work, the address with a map link, and your crew size. You can change the crew size up to the day before.",
        es: "Tus trabajos programados: el trabajo, la dirección con enlace al mapa y el tamaño de tu equipo. Puedes cambiar el tamaño del equipo hasta el día anterior.",
      },
      {
        en: "Found extra work on site? Use Request a change order and add photos.",
        es: "¿Encontraste trabajo extra en el sitio? Usa Solicitar una orden de cambio y agrega fotos.",
      },
    ],
  },
  {
    title: { en: "Past", es: "Pasados" },
    lines: [
      {
        en: "Jobs from the last 6 months, your pay for each, and whether the work passed review.",
        es: "Trabajos de los últimos 6 meses, tu pago de cada uno y si el trabajo pasó la revisión.",
      },
    ],
  },
  {
    title: { en: "Fixes needed", es: "Arreglos necesarios" },
    lines: [
      {
        en: "If we ask for fixes, a card shows at the top with what to fix. Go back, fix it, take photos of the fix, and tap Fixed, send for review.",
        es: "Si pedimos arreglos, aparece una tarjeta arriba con lo que hay que arreglar. Regresa, arréglalo, toma fotos del arreglo y toca Listo, enviar a revisión.",
      },
    ],
  },
];

export function SubHowTo({ lang, contactEmail }: { lang: Lang; contactEmail: string }) {
  return (
    <details className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm">
      <summary className="cursor-pointer font-medium text-gray-900">{tr(lang, { en: "How this page works", es: "Cómo funciona esta página" })}</summary>
      <div className="mt-3 space-y-3">
        {SECTIONS.map((s) => (
          <section key={s.title.en}>
            <h2 className="font-semibold text-gray-900">{tr(lang, s.title)}</h2>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-gray-700">
              {s.lines.map((l) => (
                <li key={l.en}>{tr(lang, l)}</li>
              ))}
            </ul>
          </section>
        ))}
        <p className="text-gray-600">
          {tr(lang, {
            en: "This link is just for you. Don't forward it. Questions? Email ",
            es: "Este enlace es solo para ti. No lo reenvíes. ¿Preguntas? Escribe a ",
          })}
          <a href={`mailto:${contactEmail}`} className="font-medium text-pink-600">
            {contactEmail}
          </a>
          .
        </p>
      </div>
    </details>
  );
}
