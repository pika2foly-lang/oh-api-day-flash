# 🔥 Oh API Day — Flash Proxy

Proxy Cloud Functions pour Oh API Day. Sert d'intermédiaire entre l'app et les providers IA (Groq, OpenAI, Anthropic, NVIDIA, custom) pour contourner les limites CORS.

## 🚀 Déploiement via Firebase Studio

1. Crée ton projet sur [Firebase Console](https://console.firebase.google.com)
2. Active le plan Blaze (gratuit sous 2M appels/mois)
3. Utilise le wizard dans Oh API Day → Réglages → Firebase

## 🔑 Clés à ajouter

Firebase Console → Functions → Variables :
- `GROQ_KEY`
- `OPENAI_KEY`
- `ANTHROPIC_KEY`
- `NVIDIA_KEY`

Voir le wizard dans Oh API Day pour les détails complets.
