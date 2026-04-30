#!/bin/bash

# Aggiunge i percorsi comuni di Brew al PATH (per macOS)
export PATH=$PATH:/opt/homebrew/bin:/usr/local/bin

echo "🚀 Avvio del Registro Riconciliazione (Unified)..."
echo ""

# Verifica se npm è installato
if ! command -v npm &> /dev/null
then
    echo "❌ Errore: 'npm' non trovato. Assicurati che Node.js sia installato."
    exit 1
fi

# Avvio unificato di proxy e frontend
npm run start:all