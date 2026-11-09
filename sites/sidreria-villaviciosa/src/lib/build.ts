// Identifica cada compilación. La portada y la carta lo comparan con /version.json
// para repintar sugerencias y carta sin recargar cuando Eligemenú lanza una compilación nueva.
export const BUILD_ID = Date.now().toString(36);
