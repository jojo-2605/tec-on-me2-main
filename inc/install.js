// Gestion de l'installation PWA
// Ce module s'attache au bouton existant `.install-btn` présent dans `carte.html`.

const installBtn = document.querySelector(".install-btn");
let deferredPrompt = null;
console.log("install.js loaded");

function isiOS() {
  return /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
}

// Cache le bouton par défaut (s'il est visible dans le HTML)
if (installBtn) {
  installBtn.style.display = "none";
}

window.addEventListener("beforeinstallprompt", (e) => {
  // Empêche l'infobar par défaut
  e.preventDefault();
  deferredPrompt = e;
  // Affiche le bouton d'installation
  if (installBtn) {
    installBtn.style.display = "inline-block";
  }
});

// Clic sur le bouton
if (installBtn) {
  installBtn.addEventListener("click", async (ev) => {
    // Si le prompt est disponible, l'afficher
    if (deferredPrompt) {
      installBtn.disabled = true;
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      // Masque le bouton après choix
      installBtn.style.display = "none";
      // Si l'utilisateur a accepté l'installation, cacher la box entière
      try {
        if (choice && choice.outcome === "accepted") {
          const installBox = document.querySelector(".box-install");
          if (installBox) installBox.style.display = "none";
        }
      } catch (err) {
        // ignore
      }
      deferredPrompt = null;
      installBtn.disabled = false;
      console.log("PWA install choice:", choice);
      return;
    }

    // Si iOS (pas de beforeinstallprompt), afficher une instruction courte
    if (isiOS()) {
      // Message discret expliquant l'ajout à l'écran d'accueil
      window.alert(
        "Sur iOS : appuyez sur le bouton 'Partager' puis 'Ajouter à l'écran d'accueil'.",
      );
      return;
    }

    // Fallback : informer l'utilisateur
    window.alert(
      "L’installation n’est pas disponible pour ce navigateur/ce contexte. Utilisez Chrome sur Android ou ouvrez via Live Server (localhost).",
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
