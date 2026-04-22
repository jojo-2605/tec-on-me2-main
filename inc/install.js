// Gestion de l'installation PWA
// Ce module s'attache au bouton existant `.install-btn` présent dans `carte.html`.

const installBtn = document.querySelector(".install-btn");
let deferredPrompt = null;
console.log("install.js loaded");

function isiOS() {
  return /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
}
function isAndroid() {
  return /android/.test(navigator.userAgent.toLowerCase());
}
function isMobile() {
  return /iphone|ipad|ipod|android/.test(navigator.userAgent.toLowerCase());
}

// Show the install button on mobile devices so user sees it immediately.
if (installBtn && isMobile()) {
  installBtn.style.display = "inline-block";
}

window.addEventListener("beforeinstallprompt", (e) => {
  // Empêche l'infobar par défaut
  e.preventDefault();
  deferredPrompt = e;
  // Affiche le bouton d'installation
  if (installBtn) {
    installBtn.style.display = "inline-block";
    installBtn.disabled = false;
    installBtn.textContent = "Installer";
  }
});

// Clic sur le bouton
if (installBtn) {
  // If we showed the button early but the prompt isn't ready yet, keep it enabled
  // clicking will either trigger the prompt (when available) or show helpful instructions.
  installBtn.addEventListener("click", async (ev) => {
    // If the prompt is available, show it
    if (deferredPrompt) {
      try {
        installBtn.disabled = true;
        deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        // Hide the button after choice
        installBtn.style.display = "none";
        if (choice && choice.outcome === "accepted") {
          const installBox = document.querySelector(".box-install");
          if (installBox) installBox.style.display = "none";
        }
        deferredPrompt = null;
      } catch (err) {
        console.warn("Erreur lors du prompt d'installation", err);
      } finally {
        installBtn.disabled = false;
      }
      return;
    }

    // If iOS, show the manual instruction
    if (isiOS()) {
      window.alert(
        "Sur iOS : appuyez sur le bouton 'Partager' puis 'Ajouter à l'écran d'accueil'.",
      );
      return;
    }

    // If Android but no prompt yet, give a helpful message explaining why and how to enable
    if (isAndroid()) {
      window.alert(
        "L'installation n'est pas encore disponible automatiquement. Assurez-vous d'ouvrir le site via HTTPS et d'actualiser la page. Si le problème persiste, ouvrez le menu Chrome et sélectionnez 'Ajouter à l'écran d'accueil' (si disponible).",
      );
      return;
    }

    // Generic fallback
    window.alert(
      "L’installation n’est pas disponible pour ce navigateur/ce contexte. Essayez Chrome sur Android ou vérifiez que le site est servi via HTTPS.",
    );
  });
}

window.addEventListener("appinstalled", () => {
  // L'application a été installée — cacher toute la box d'installation
  deferredPrompt = null;
  try {
    const installBox = document.querySelector(".box-install");
    if (installBox) {
      installBox.style.display = "none";
    } else if (installBtn) {
      installBtn.style.display = "none";
    }
  } catch (err) {
    if (installBtn) installBtn.style.display = "none";
  }
  console.log("PWA installed");
});

export {};
