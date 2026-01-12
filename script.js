document.addEventListener("DOMContentLoaded", () => {
  const progress = document.getElementById("progress");
  const tocLinks = Array.from(document.querySelectorAll(".toc a[href^='#']"));
  const tocTargets = tocLinks
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);

  const updateProgress = () => {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const percent = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
    progress.style.width = `${percent}%`;
  };

  const setActiveTocLink = (sectionId) => {
    for (const link of tocLinks) {
      const isActive = link.getAttribute("href") === `#${sectionId}`;
      link.classList.toggle("active", isActive);
    }
  };

  if ("IntersectionObserver" in window && tocTargets.length > 0) {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible.length === 0) return;
        setActiveTocLink(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -70% 0px", threshold: [0, 0.1, 0.2, 0.4, 0.6, 0.8, 1] }
    );

    for (const target of tocTargets) observer.observe(target);
  } else if (tocTargets.length > 0) {
    const updateActiveOnScroll = () => {
      const y = window.scrollY + window.innerHeight * 0.25;
      let current = tocTargets[0].id;
      for (const section of tocTargets) {
        if (section.offsetTop <= y) current = section.id;
      }
      setActiveTocLink(current);
    };
    window.addEventListener("scroll", updateActiveOnScroll, { passive: true });
    updateActiveOnScroll();
  }

  updateProgress();
  window.addEventListener("scroll", updateProgress, { passive: true });
  window.addEventListener("resize", updateProgress);

  const ttsButton = document.getElementById("tts-toggle");
  const overviewSection = document.getElementById("overview");

  if (ttsButton && overviewSection) {
    const ttsLabel = ttsButton.querySelector(".sr-only");
    if (!("speechSynthesis" in window)) {
      ttsButton.disabled = true;
      ttsButton.setAttribute("aria-disabled", "true");
      ttsButton.setAttribute("aria-label", "Speech not supported");
      ttsButton.setAttribute("title", "Speech not supported");
      if (ttsLabel) ttsLabel.textContent = "Speech not supported";
    } else {
      const synth = window.speechSynthesis;
      let isReading = false;
      let selectedVoice = null;

      const chooseVoice = () => {
        const voices = synth.getVoices();
        if (!voices || voices.length === 0) return;
        selectedVoice =
          voices.find((voice) => voice.lang && voice.lang.toLowerCase().startsWith("en")) ||
          voices[0] ||
          null;
      };

      const setButtonState = (reading) => {
        const label = reading ? "Stop reading" : "Read from overview";
        ttsButton.setAttribute("aria-pressed", String(reading));
        ttsButton.setAttribute("aria-label", label);
        ttsButton.setAttribute("title", label);
        if (ttsLabel) ttsLabel.textContent = label;
      };

      const collectArticleText = () => {
        const sections = Array.from(document.querySelectorAll(".content section"));
        if (sections.length === 0) return [];
        const startIndex = sections.findIndex((section) => section.id === "overview");
        const sectionSlice = sections.slice(startIndex === -1 ? 0 : startIndex);
        const blocks = [];

        for (const section of sectionSlice) {
          const elements = Array.from(section.querySelectorAll("h2, h3, p, li, th, td"));
          for (const element of elements) {
            const text = element.textContent.replace(/\s+/g, " ").trim();
            if (text.length > 0) blocks.push(text);
          }
        }

        return blocks;
      };

      const speakChunks = (chunks) => {
        let index = 0;

        const speakNext = () => {
          if (!isReading) return;
          if (index >= chunks.length) {
            isReading = false;
            setButtonState(false);
            return;
          }

          const utterance = new SpeechSynthesisUtterance(chunks[index]);
          if (selectedVoice) utterance.voice = selectedVoice;
          utterance.rate = 1;
          utterance.pitch = 1;
          utterance.onend = () => {
            index += 1;
            speakNext();
          };
          utterance.onerror = () => {
            isReading = false;
            setButtonState(false);
          };
          synth.speak(utterance);
        };

        speakNext();
      };

      const startReading = () => {
        const chunks = collectArticleText();
        if (chunks.length === 0) return;

        synth.cancel();
        isReading = true;
        setButtonState(true);
        speakChunks(chunks);
      };

      const stopReading = () => {
        isReading = false;
        synth.cancel();
        setButtonState(false);
      };

      chooseVoice();
      if (typeof synth.addEventListener === "function") {
        synth.addEventListener("voiceschanged", chooseVoice);
      }

      ttsButton.addEventListener("click", () => {
        if (isReading) {
          stopReading();
        } else {
          startReading();
        }
      });
    }
  }
});
