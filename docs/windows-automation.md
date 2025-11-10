# Automatisation WireGuard pour Windows

## Vue d'ensemble

L'interface web génère maintenant un script PowerShell qui automatise complètement l'installation et l'activation de WireGuard sur Windows.

## Boutons disponibles dans l'interface

Pour chaque instance VPN, vous avez maintenant 4 boutons principaux :

### 1. **Run (PC)** - Installation automatique Windows
- **Fonctionnalité** : Télécharge un script PowerShell (.ps1) qui :
  - Récupère automatiquement la config WireGuard depuis l'API
  - Détecte l'installation de WireGuard sur votre PC
  - Installe le tunnel WireGuard
  - Active automatiquement la connexion VPN
- **Prérequis** : WireGuard doit être installé sur Windows ([télécharger ici](https://www.wireguard.com/install/))
- **Usage** :
  1. Cliquez sur "Run (PC)"
  2. Le script `vpn-{instance-id}-setup.ps1` est téléchargé
  3. Clic droit → "Exécuter avec PowerShell" (ou lancez-le depuis PowerShell)
  4. Le VPN s'active automatiquement

### 2. **Start** - Activer le VPN (mobile/PC manuel)
- **Fonctionnalité** : Télécharge ou partage la config WireGuard
- **Usage** :
  - Sur **iOS/Android** : partage le fichier .conf directement vers l'app WireGuard
  - Sur **PC** : télécharge le fichier .conf pour import manuel dans WireGuard

### 3. **Stop** - Désactiver le VPN
- **Fonctionnalité** : Affiche les commandes pour désactiver le tunnel
- **Commandes** :
  - Windows : `wireguard.exe /deactivate {instance-id}`
  - Linux/macOS : `sudo wg-quick down wg0`
  - iOS/Android : désactiver dans l'app WireGuard

### 4. **Delete** - Supprimer l'instance
- **Fonctionnalité** : Termine (supprime) définitivement l'instance EC2 VPN
- **Confirmation** : Une popup de confirmation est affichée avant la suppression

### 5. **IP publique (copiable)**
- Un petit bouton à côté de l'IP publique permet de copier l'adresse dans le presse-papier
- Utile pour configurer des règles firewall ou pour partager l'adresse

## Script PowerShell - Détails techniques

Le script généré effectue les actions suivantes :

```powershell
# 1. Télécharge la config depuis l'API
Invoke-RestMethod -Uri "$apiUrl/instances/$instanceId/config" -OutFile "$configPath-raw.json"
$configData = Get-Content "$configPath-raw.json" | ConvertFrom-Json
$configData.configBody | Out-File -FilePath $configPath -Encoding ASCII

# 2. Détecte WireGuard
$wgPath = "C:\Program Files\WireGuard\wireguard.exe"

# 3. Installe le tunnel
& $wgPath /installtunnelservice "$configPath"

# 4. Active le tunnel
& $wgPath /activate "$instanceId"
```

## Sécurité

- Les configs sont téléchargées via HTTPS
- L'API renvoie des URLs signées S3 (courte durée de validité)
- Le script vérifie l'intégrité des données téléchargées
- Le tunnel est installé comme service Windows (sécurisé)

## Troubleshooting

### WireGuard non trouvé
Si le script ne trouve pas WireGuard :
1. Téléchargez WireGuard : https://www.wireguard.com/install/
2. Installez-le dans `C:\Program Files\WireGuard`
3. Re-exécutez le script

### Erreur d'exécution de script PowerShell
Si Windows bloque l'exécution :
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Le tunnel ne s'active pas automatiquement
Activez manuellement :
```powershell
wireguard.exe /activate {instance-id}
```

### Vérifier l'état du tunnel
```powershell
wireguard.exe /status {instance-id}
```

## Tests rapides après activation

1. **Vérifier l'IP publique** :
   ```powershell
   Invoke-RestMethod -Uri "https://ifconfig.me"
   ```
   → Devrait afficher l'IP du serveur VPN

2. **Ping test** :
   ```powershell
   ping 8.8.8.8
   tracert 8.8.8.8
   ```

3. **DNS leak test** :
   - Ouvrir https://ipleak.net dans le navigateur
   - Vérifier que l'IP affichée est celle du VPN

## Utilisation sur Linux/macOS

Pour Linux/macOS, utilisez le bouton "Start" pour télécharger la config, puis :

```bash
# Linux/macOS
sudo cp vpn.conf /etc/wireguard/wg0.conf
sudo chmod 600 /etc/wireguard/wg0.conf
sudo wg-quick up wg0
sudo wg show
```

## Utilisation sur iOS/Android

1. Installez l'app WireGuard officielle
2. Cliquez sur "Start" dans l'interface web
3. Sur mobile : l'OS proposera d'ouvrir directement avec WireGuard
4. Importez la config et activez le tunnel

## Architecture

```
Frontend (React PWA)
    ↓
CloudFront (HTTPS)
    ↓
API Gateway
    ↓
Lambda Function
    ↓
EC2 WireGuard Instance + S3 Config Bucket
```

## URLs

- **Frontend** : https://ddxial11gesc4.cloudfront.net
- **API** : https://h9e6681vl2.execute-api.eu-west-3.amazonaws.com
- **Bucket configs** : s3://vpn-pwa-simple-config

## Support

Pour des problèmes ou questions :
1. Vérifiez que l'instance est dans l'état "ready" (WireGuard: READY)
2. Vérifiez que le Security Group autorise UDP 51820
3. Consultez les logs Lambda/EC2 dans CloudWatch
