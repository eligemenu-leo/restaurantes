# Pendiente — La Vaca Asustada

- [x] Fotos migradas desde WordPress.
- [x] Menú separado por local (/menu-oviedo/ y /menu-gijon/), cada uno con su slug de Eligemenú.
- [ ] Origen del T-bone: el inicio actual dice "Extremadura y Andalucía" y el menú "Valladolid". Se usa el del menú; confirmar.
- [ ] Reseñas: seis en la web actual (Germán Valverde, José Jiménez, Igna Halcón, Ricardo Díaz García, José Bodalbo, Manuel Soto Braña); copiar texto literal del export.
- [ ] Textos de "Sobre nosotros": reescritos a partir de la web actual; validar o sustituir por los originales.
- [ ] Horario: la web actual dice "12:30–18:00 | 19:30–1:00" todos los días para ambos locales. Confirmar.
- [ ] Textos legales del export, con titular y NIF.
- [x] Carta conectada a Eligemenú al compilar (falta poner ELIGEMENU_API_KEY en Cloudflare).
- [ ] Alérgenos por plato (probablemente vendrán de Eligemenú).
- [ ] Logo en SVG.
- [ ] Antes de cambiar DNS: dónde está el correo de info@ (registros MX). El correo sigue en OVH: copiar sus registros a Cloudflare antes de cambiar DNS.
- [ ] Horario: Eligemenú dice que Oviedo cierra el martes y abre a las 12:00, y no tiene horario del miércoles en ningún local; la web antigua dice todos los días de 12:30. Confirmar cuál es el bueno (y corregir el otro).
- [ ] Eligemenú: el T-bone de Gijón no tiene la unidad "kg" (sale 76 € sin "/ kg"); el email de Oviedo pone "lavacaasutada"; "Vinos Dulces" está dentro de la carta de platos.
- [ ] Declaración de accesibilidad: es la de la web antigua (dice "parcialmente conforme" y la URL "https://https://"). Actualizarla para la web nueva.
- [ ] Reseñas: no se han migrado las de Igna Halcón y Manuel Soto Braña (incluyen críticas) ni la de Ricardo Díaz García (texto duplicado de otra).
- [ ] Bonos regalo: confirmar importes (ahora 50, 100 y 150 €), validez (ahora 12 meses), locales donde valen y condiciones de devolución. Están en `src/data/bonos.json` y en la tabla `comercios` del servicio de bonos; tienen que coincidir.
- [ ] Bonos regalo: poner en marcha el servicio (`servicios/bonos/README.md`), rellenar `endpoint` y `activo: true`. Datos reales del TPV del banco (FUC, terminal, clave).
- [ ] Bonos regalo: página para que el personal compruebe un código y lo marque como usado.
