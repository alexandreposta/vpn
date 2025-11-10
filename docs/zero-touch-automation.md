# Automatisation VPN Windows - Zéro Interaction

## Vue d'ensemble

L'interface web génère maintenant des scripts batch (.bat) qui automatisent **complètement** l'activation et la désactivation du VPN sur Windows. **Aucune action utilisateur requise** après le double-clic (sauf accepter l'élévation admin UAC).

## Fonctionnalités

### ✅ Bouton "Run" - Activation automatique
**Ce qui se passe automatiquement :**
1. Le script s'auto-élève en administrateur (UAC)
2. Vérifie si WireGuard est installé
3. Si manquant : télécharge et installe WireGuard automatiquement
4. Décode la configuration VPN (embarquée en base64 dans le script)
5. Installe le tunnel WireGuard
6. Active la connexion VPN
7. Affiche le statut et se ferme après 10 secondes

**Durée totale : ~30 secondes** (première installation)  
**Durée si WireGuard déjà installé : ~5 secondes**

### ✅ Bouton "Stop" - Désactivation automatique
**Ce qui se passe automatiquement :**
1. Le script s'auto-élève en administrateur (UAC)
2. Localise WireGuard
3. Désactive le tunnel VPN
4. Affiche le statut et se ferme après 5 secondes

**Durée : ~5 secondes**

### 📋 Bouton "IP: xxx.xxx.xxx.xxx" - Copie de l'IP publique
- Un clic copie l'adresse IP publique du serveur VPN dans le presse-papier
- Utile pour configuration firewall ou partage

### 🗑️ Bouton "Delete" - Suppression de l'instance
- Supprime définitivement l'instance EC2 VPN
- Confirmation requise avant suppression

## Utilisation

### Première utilisation
1. Ouvrir l'interface : https://ddxial11gesc4.cloudfront.net
2. Créer une instance VPN (choisir région et nom optionnel)
3. Attendre que l'instance passe en état "WireGuard: READY" (~60 secondes)
4. Cliquer sur "Run"
5. Le fichier `vpn-{instance-id}-autoinstall.bat` est téléchargé
6. **Double-cliquer sur le fichier .bat**
7. Accepter l'élévation UAC (administrateur)
8. **C'est tout !** Le VPN s'active automatiquement

### Désactivation
1. Cliquer sur "Stop"
2. Le fichier `vpn-{instance-id}-stop.bat` est téléchargé
3. **Double-cliquer sur le fichier .bat**
4. Accepter l'élévation UAC
5. **C'est tout !** Le VPN se désactive automatiquement

### Réactivation ultérieure
- Si vous avez déjà exécuté le script "Run" une fois, le tunnel est installé
- Pour réactiver : re-téléchargez et re-exécutez le script "Run" (ou utilisez `wireguard.exe /activate {instance-id}` en ligne de commande)
- Le script "Stop" conserve la configuration pour permettre une réactivation rapide

## Détails techniques

### Script Run (autoinstall.bat)
- **Auto-élévation admin** : UAC prompt si pas déjà admin
- **Détection WireGuard** : cherche dans Program Files, Program Files (x86)
- **Installation automatique** : télécharge depuis https://download.wireguard.com/windows-client/
- **Config embarquée** : la configuration VPN est encodée en base64 dans le script (pas de téléchargement réseau nécessaire après le premier clic)
- **Installation du tunnel** : `wireguard.exe /installtunnelservice`
- **Activation** : `wireguard.exe /activate {instance-id}`

### Script Stop (stop.bat)
- **Auto-élévation admin** : UAC prompt si pas déjà admin
- **Désactivation** : `wireguard.exe /deactivate {instance-id}`
- **Conservation de la config** : le tunnel reste installé (commentez la ligne `uninstalltunnelservice` dans le script si vous voulez le supprimer complètement)

### Sécurité
- ✅ Les scripts s'auto-élèvent en admin (sécurité Windows UAC)
- ✅ La configuration est téléchargée via HTTPS depuis l'API
- ✅ La configuration contient des clés WireGuard uniques par instance
- ✅ Le trafic VPN est chiffré (WireGuard)
- ✅ Les scripts batch sont lisibles (aucun code obfusqué)

## Vérification que le VPN fonctionne

### 1. Vérifier l'IP publique
Avant activation :
```powershell
Invoke-RestMethod -Uri "https://ifconfig.me"
```

Après activation (devrait afficher l'IP du serveur VPN) :
```powershell
Invoke-RestMethod -Uri "https://ifconfig.me"
```

### 2. Vérifier le statut WireGuard
```powershell
"C:\Program Files\WireGuard\wireguard.exe" /status {instance-id}
```

### 3. Test de connectivité
```powershell
ping 8.8.8.8
tracert 8.8.8.8
```

### 4. Test DNS leak
Ouvrir dans un navigateur : https://ipleak.net  
→ L'IP affichée doit être celle du serveur VPN

## Troubleshooting

### Le script ne s'exécute pas
**Solution** : Clic droit → "Exécuter en tant qu'administrateur"

### WireGuard ne s'installe pas automatiquement
**Solution manuelle** :
1. Télécharger WireGuard : https://www.wireguard.com/install/
2. Installer manuellement
3. Re-exécuter le script Run

### Le tunnel ne s'active pas
**Vérifications** :
1. WireGuard est installé : `"C:\Program Files\WireGuard\wireguard.exe"`
2. Le tunnel est installé : voir dans l'interface WireGuard GUI
3. Activer manuellement via GUI WireGuard ou :
   ```cmd
   "C:\Program Files\WireGuard\wireguard.exe" /activate {instance-id}
   ```

### Erreur "Access Denied"
**Solution** : Le script doit s'exécuter en administrateur. Répondez "Oui" au prompt UAC.

### Le VPN se connecte mais pas d'accès Internet
**Vérifications côté serveur** :
1. Security Group autorise UDP 51820 : vérifier dans AWS Console
2. IP forwarding activé : `sysctl net.ipv4.ip_forward` (doit être 1)
3. NAT/masquerade configuré : `iptables -t nat -L` (doit avoir MASQUERADE)
4. WireGuard écoute : `ss -unp | grep 51820`

### Supprimer complètement le tunnel
```powershell
"C:\Program Files\WireGuard\wireguard.exe" /uninstalltunnelservice {instance-id}
```

## Architecture

```
┌─────────────────────────────────────────┐
│  Frontend PWA (React + Vite)           │
│  https://ddxial11gesc4.cloudfront.net  │
└─────────────┬───────────────────────────┘
              │
              │ HTTPS
              ▼
┌─────────────────────────────────────────┐
│  CloudFront (CDN)                       │
│  Distribution: E39FNAVCOI4KSC          │
└─────────────┬───────────────────────────┘
              │
              │ Origin: S3
              ▼
┌─────────────────────────────────────────┐
│  S3 Bucket: vpn-pwa-simple-frontend    │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  API Gateway (HTTP API)                 │
│  https://h9e6681vl2.execute-api...     │
└─────────────┬───────────────────────────┘
              │
              │ Proxy
              ▼
┌─────────────────────────────────────────┐
│  Lambda Function (Node.js 20)          │
│  vpn-pwa-simple-function               │
└─────────────┬───────────────────────────┘
              │
              │ AWS SDK
              ▼
┌─────────────────────────────────────────┐
│  EC2 Instance (WireGuard Server)       │
│  Amazon Linux 2023 (ARM64, t4g.micro)  │
│  WireGuard listening on UDP 51820      │
└─────────────────────────────────────────┘
              │
              │ Upload config
              ▼
┌─────────────────────────────────────────┐
│  S3 Bucket: vpn-pwa-simple-config      │
│  {instance-id}.conf                    │
└─────────────────────────────────────────┘
```

## URLs et Ressources

- **Frontend** : https://ddxial11gesc4.cloudfront.net
- **API** : https://h9e6681vl2.execute-api.eu-west-3.amazonaws.com
- **Bucket configs** : s3://vpn-pwa-simple-config
- **Bucket frontend** : s3://vpn-pwa-simple-frontend
- **WireGuard Windows** : https://www.wireguard.com/install/

## Support

En cas de problème :
1. Vérifier que l'instance est en état "WireGuard: READY"
2. Vérifier les logs CloudWatch de la Lambda
3. Vérifier les logs système de l'instance EC2 : `journalctl -u wg-quick@wg0`
4. Vérifier le Security Group : UDP 51820 ouvert

## Notes importantes

- ⚠️ Le script télécharge WireGuard depuis le site officiel (pas de vérification de signature dans le batch)
- ⚠️ Le tunnel reste installé après "Stop" (pour réactivation rapide)
- ⚠️ Supprimer l'instance EC2 ne supprime pas le tunnel local (utilisez le bouton Delete + uninstall manuel si désiré)
- ✅ Vous pouvez avoir plusieurs instances VPN actives simultanément (chacune avec son propre tunnel/ID)
