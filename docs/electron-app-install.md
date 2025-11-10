# VPN Manager - Application Windows

## Installation

### Téléchargement
Téléchargez la dernière version : [VPN-Manager-Windows-x64.zip](https://ddxial11gesc4.cloudfront.net/download/VPN-Manager-Windows-x64.zip) (~134 MB)

### Installation (simple)
1. Télécharger le fichier `VPN-Manager-Windows-x64.zip`
2. Extraire l'archive (clic droit → Extraire tout...)
3. Ouvrir le dossier `win-unpacked`
4. Double-cliquer sur `VPN Manager.exe`
5. Accepter l'élévation admin (UAC) si demandé
6. L'application se lance !

### Optionnel : Créer un raccourci
- Clic droit sur `VPN Manager.exe` → Créer un raccourci
- Déplacer le raccourci sur le Bureau ou dans le menu Démarrer

## Utilisation

### Première utilisation
1. Lancer VPN Manager
2. L'app affiche la liste de vos instances VPN
3. Créer une nouvelle instance (choisir région)
4. Attendre que l'instance passe en "WireGuard: READY" (~60 secondes)

### Activer le VPN (un clic !)
1. Cliquer sur le bouton **"Run"**
2. Le VPN s'active instantanément (aucune autre action requise)
3. ✅ Vous êtes connecté au VPN !

### Désactiver le VPN (un clic !)
1. Cliquer sur le bouton **"Stop"**
2. Le VPN se désactive instantanément
3. ✅ Connexion normale rétablie

### Vérifier que le VPN fonctionne
Ouvrir un navigateur et visiter : https://ifconfig.me  
→ L'IP affichée doit être celle du serveur VPN (visible dans l'app)

## Avantages de l'app vs. version web

| Fonctionnalité | App Windows | Web (PWA) |
|----------------|-------------|-----------|
| Activation VPN | ✅ 1 clic (instantané) | ⚠️ Télécharger .bat + double-clic |
| Désactivation VPN | ✅ 1 clic (instantané) | ⚠️ Télécharger .bat + double-clic |
| Installation WireGuard | ✅ Automatique | ⚠️ Manuel |
| Icône dans la barre système | ✅ Oui | ❌ Non |
| Fonctionne hors ligne | ✅ Oui (après première ouverture) | ⚠️ Limité |
| Compatible iOS/Android | ❌ Non | ✅ Oui (PWA web) |

**Recommandation** :
- **Windows** : Utilisez l'app desktop (meilleure expérience)
- **iOS/Android** : Utilisez la version web PWA (https://ddxial11gesc4.cloudfront.net)

## Prérequis

### WireGuard
L'app nécessite WireGuard installé sur Windows.

**Installation automatique** :  
Si WireGuard n'est pas installé, l'app peut tenter de le télécharger et l'installer automatiquement lors de la première activation.

**Installation manuelle** (recommandée) :  
Télécharger et installer depuis : https://www.wireguard.com/install/

### Droits Administrateur
L'app demande les droits administrateur car :
- WireGuard nécessite admin pour installer/activer des tunnels VPN
- Configuration des interfaces réseau (nécessite élévation)

## Troubleshooting

### L'app ne se lance pas
**Solution** : Vérifier que vous avez extrait **tous les fichiers** du zip (pas juste l'exe). L'exe a besoin des DLL et ressources.

### "WireGuard not found"
**Solution** : Installer WireGuard manuellement depuis https://www.wireguard.com/install/ puis relancer l'app.

### Le VPN ne s'active pas
**Vérifications** :
1. WireGuard est installé : vérifier dans `C:\Program Files\WireGuard\`
2. L'instance est en état "READY" dans l'app
3. Vous avez accepté l'élévation UAC (administrateur)

**Solution** : Relancer l'app en tant qu'administrateur (clic droit → Exécuter en tant qu'administrateur)

### Erreur "Failed to activate tunnel"
**Causes possibles** :
- Un autre VPN est actif (désactiver les autres VPN d'abord)
- WireGuard est déjà en cours d'utilisation (fermer l'app WireGuard GUI si ouverte)
- Antivirus bloque (ajouter une exception pour VPN Manager et WireGuard)

**Solution** :
1. Fermer toutes les autres apps VPN
2. Redémarrer VPN Manager
3. Réessayer l'activation

### L'app se ferme quand je clique sur [X]
**C'est normal** : L'app continue de tourner dans la barre système (icône en bas à droite).  
Pour vraiment quitter : clic droit sur l'icône → Quitter

### Pas d'accès Internet après activation
**Vérifications côté serveur** :
1. Security Group AWS autorise UDP 51820
2. Instance EC2 est bien en cours d'exécution
3. WireGuard est actif sur le serveur

**Test réseau** :
```cmd
ping 8.8.8.8
tracert 8.8.8.8
```

## Désinstallation

### App
1. Supprimer le dossier `win-unpacked` (ou là où vous avez extrait l'app)
2. Supprimer les raccourcis créés

### Tunnels WireGuard
Si vous voulez aussi supprimer les tunnels VPN installés :
1. Ouvrir l'app WireGuard GUI
2. Sélectionner le tunnel → Supprimer
3. Ou en ligne de commande :
   ```cmd
   "C:\Program Files\WireGuard\wireguard.exe" /uninstalltunnelservice {instance-id}
   ```

## Mises à jour

Actuellement les mises à jour sont manuelles :
1. Télécharger la nouvelle version
2. Extraire et remplacer les fichiers
3. Relancer l'app

*Auto-update sera ajouté dans une future version.*

## Support

En cas de problème :
1. Vérifier cette documentation
2. Consulter les logs CloudWatch de votre instance Lambda
3. Vérifier l'état de votre instance EC2 dans AWS Console

## Architectture technique

```
VPN Manager App (Electron)
    ↓
WireGuard CLI (Windows)
    ↓
Tunnel VPN
    ↓
Instance EC2 WireGuard Server (AWS)
    ↓
Internet
```

## URLs et Ressources

- **App Windows** : https://ddxial11gesc4.cloudfront.net/download/VPN-Manager-Windows-x64.zip
- **Version Web** : https://ddxial11gesc4.cloudfront.net
- **API** : https://h9e6681vl2.execute-api.eu-west-3.amazonaws.com
- **WireGuard** : https://www.wireguard.com/install/

## License

Propriétaire - Alexandre Posta

---

Version 1.0.0 - Novembre 2025
