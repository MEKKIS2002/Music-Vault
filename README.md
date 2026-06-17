# Music Vault

Personlig hiphop-studioapp for én artist. Samler beats, tekster, innspillinger og
prosjektflyt på én skjerm — kjører direkte i nettleseren uten server eller installasjon.

**Live:** [mekkis2002.github.io/Music-Vault](https://mekkis2002.github.io/Music-Vault/)

> 🛠️ Jobber du med koden? All teknisk dokumentasjon (arkitektur, datamodell, konvensjoner,
> versjoner og fallgruver) ligger i [`FINDINGS.md`](FINDINGS.md). Les den først.

---

## Hva er Music Vault?

Et privat studioverktøy som holder hele den kreative prosessen samlet: fra rå beat til
ferdig låt. Du laster opp beats, skriver tekster i en fullskjerms teksteditor, spiller inn
vokal rett over beatet i nettleseren, og organiserer alt i mixtapes og album med oversikt
over hvor langt hver utgivelse er kommet.

---

## Faner og funksjoner

| Fane | Beskrivelse |
|------|-------------|
| 🎵 **Beats** | Oversikt over alle sanger med søk, sortering og ⋯-meny. |
| 📼 **Mixtapes** | Realistiske kassett-kort. |
| 📁 **Albumer** | Offisielle utgivelser med vinyl-animasjon. Tre visningsmoduser: rader, kort, studio. |
| 📊 **Pipeline** | Kanban-oversikt over aktive album med ferdigstillelsesprosent. |
| 🗄️ **Arkivert** | Fysisk trekasse-grensesnitt for arkiverte demoer, mixtapes og album. |
| ✍️ **Lyric Lab** | Fullskjerms teksteditor (se under). |
| 🔌 **Integrasjoner** | Tilkobling, import/eksport, backup og endringslogg. |

---

## Lyric Lab

Studioskjerm for tekstskriving i tre kolonner:

- **Venstre — Beat-info:** cover, tittel, produsent, BPM, toneart og mood. Velg status
  (utkast → skriver → demo → revisjon → ferdig), spill beat, spill inn vokal over beat,
  eller ta en hurtigmemo.
- **Midten — Seksjonseditor:** del teksten i Hook, Vers, Bro, Outro og egendefinerte
  seksjoner. Linjenummer, collapse/expand og ⋯-meny for å duplisere, flytte eller slette.
  Alt lagres automatisk mens du skriver.
- **Høyre — Analyse og rimbank:** statistikk (ord, linjer, seksjoner, estimert låtlengde),
  varsler om manglende seksjoner og gjentatte ord, og en **rimbank** — skriv eller marker et
  ord og få norske rimforslag.

**Spille inn over beat:** mikrofon og beat mikses i nettleseren, og opptaket lagres på
låten. Krever mikrofontilgang.

---

## Slik bruker du den

1. Åpne [appen](https://mekkis2002.github.io/Music-Vault/) og logg inn med brukernavnet ditt.
2. Legg til beats og fyll inn info (BPM, toneart, mood).
3. Skriv tekst i **Lyric Lab**, og spill eventuelt inn vokal over beatet.
4. Organiser låtene i **mixtapes** og **album**, og følg fremdriften i **Pipeline**.
5. Arkiver det du er ferdig med i **Arkivert**.

Alt du gjør lagres automatisk og synkroniseres på tvers av enhetene dine.

---

## Brukere og tilgang

| Brukernavn | Rolle |
|------------|-------|
| marcus | admin |
| erik | admin |

I **viewer-modus** vises kun Mixtapes og Beats.

---

*Versjon: v2.2 — Mai 2026. Teknisk dokumentasjon: [`FINDINGS.md`](FINDINGS.md).*
