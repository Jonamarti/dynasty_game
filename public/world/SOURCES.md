# Fuentes de los mapas

`earth-present.bin` y `earth-12000-bce.bin` guardan 96 × 48 muestras, en
centros separados por 3,75°. Se generan con `npm run world:build`; cada mapa
ocupa 32.268 bytes y el juego no necesita red. La rejilla va de oeste a este
con centros −178,125°…178,125°, y de norte a sur. El 2026-10-04 se regeneró
para corregir la longitud del relieve y del clima; véase el
[contrato de coordenadas](../../docs/m15_phase29_atlas_alignment.md).

## Fuentes del relieve, clima y aguas

- NOAA NCEI, **ETOPO 2022, 60 arc-second, global, Ice Surface**, elevación y
  batimetría en metros. [Guía](https://www.ngdc.noaa.gov/mgg/global/relief/ETOPO2022/docs/1.2%20ETOPO%202022%20User%20Guide.pdf)
  · DOI [10.25921/fd45-gt74](https://doi.org/10.25921/fd45-gt74). NOAA permite
  uso y redistribución libres.
- Beck, H. E. et al. (2018), **Present and future Köppen-Geiger climate
  classification maps at 1-km resolution**, *Scientific Data* 5:180214. Se
  muestrea la capa presente de 0,5° (1980–2016), no una reconstrucción
  paleoclimática. [Artículo](https://doi.org/10.1038/sdata.2018.214) ·
  [datos de autores](https://doi.org/10.6084/m9.figshare.6396959) · licencia
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- Ríos y lagos: Natural Earth, vectores físicos 1:110m (ríos, líneas de lago y
  lagos), [dominio público](https://www.naturalearthdata.com/about/terms-of-use/).

## Bibliografía de cada semilla regional

Las coordenadas exactas están en `src/sim/world/WorldFeatureSeeds.ts`; la
columna `source` de **cada registro** enlaza una clave de esta tabla. Cada
punto es una semilla regional de baja resolución inspirada por la bibliografía,
no una coordenada de yacimiento, una distribución natural completa ni una
afirmación de que el recurso estuviera presente o explotado hace 12.000 años.
Las áreas de domesticación son aproximadas y a menudo debatidas; una zona de
origen de domesticación tampoco equivale necesariamente al rango silvestre.

| Clave | Semilla (latitud, longitud) | Base bibliográfica de la aproximación |
|---|---:|---|
| `wheat-barley-fertile-crescent` (wildWheat) | 34, 43 | Trigo silvestre y cebada en el arco de la Media Luna Fértil, con varios focos y procesos: [Riehl et al. (2013), evidencia arqueobotánica de Chogha Golan](https://doi.org/10.1126/science.1236743). |
| `wheat-barley-fertile-crescent` (wildBarley) | 36, 42 | Mismas fuentes; Chogha Golan documenta cultivo de cebada silvestre y trigo en una secuencia larga, no un único punto de domesticación. |
| `rice-yangtze` | 30, 112 | Arqueobotánica y genética del arroz en el valle del Yangtsé: [Gross y Zhao (2014), PNAS](https://doi.org/10.1073/pnas.1308942110). La historia de la domesticación es prolongada y discutida. |
| `millet-yellow-river` | 37, 110 | La síntesis de [Zhao (2011)](https://doi.org/10.1086/659308) sitúa los centros de mijo seco en el norte de China, a lo largo de una amplia zona del Amarillo. |
| `maize-balsas` | 19, −97 | Teosinte y domesticación de maíz en el sur de México: [Matsuoka et al. (2002), PNAS](https://doi.org/10.1073/pnas.052125199). |
| `potato-southern-peru` | −15, −70 | Diversidad de parientes silvestres y domesticación en los Andes del sur de Perú: [Hardigan et al. (2017)](https://pmc.ncbi.nlm.nih.gov/articles/PMC5699086/). |
| `sorghum-eastern-sahel` | 13, 1 | **Abierta: centroide sin respaldo local.** [Winchell et al. (2017)](https://doi.org/10.1086/693898) identifican impresiones de sorgo silvestre y domesticado en KG23, cerca de Kassala, en el Sudán oriental; eso respalda cultivo/domesticación en el Sahel oriental, no el punto guardado en África occidental. Hace falta decidir si la semilla representa un foco arqueobotánico o un rango silvestre, y aportar una fuente de ese rango para 13°N, 1°E o revisar la coordenada en un bloque posterior. No se cambian aquí datos ni mapas. |
| `aurochs-southwest-asia` | 38, 42 | La domesticación taurina se asocia a una región entre Anatolia sudoriental, Siria y Zagros, no a un solo sitio: [Scheu et al. (2015)](https://doi.org/10.1186/s12863-015-0203-2). La distribución silvestre del uro era mucho mayor. |
| `sheep-zagros` | 36, 45 | Evidencia zooarqueológica e isotópica de manejo temprano de ovejas y cabras en Ganj Dareh, Bestansur y Jarmo: [de Groene et al. (2023)](https://doi.org/10.1016/j.jasrep.2023.103936). |
| `goat-zagros` | 35, 46 | Evidencia arqueogenómica de manejo de cabras en el Zagros: [Daly et al. (2021), PNAS](https://doi.org/10.1073/pnas.2100901118). |
| `horse-volga-don` | 48, 35 | **Abierta: centroide fuera del foco citado y tipo de dato ambiguo.** [Librado et al. (2021)](https://doi.org/10.1038/s41586-021-04018-9) infieren el origen del linaje de caballos domésticos modernos en las estepas de Eurasia occidental, especialmente el bajo Volga–Don; su polígono inferido y muestras cercanas no respaldan 48°N, 35°E. El estudio no establece el rango natural completo del caballo silvestre. Hace falta aclarar si la clave representa procedencia de domesticación o distribución silvestre y, para lo segundo, una fuente de rango natural. No se cambian aquí datos ni mapas. |
| `llama-southern-andes` | −14, −72 | La llama deriva del guanaco; la domesticación de camélidos se sitúa en los Andes, con focos propuestos en punas secas meridionales: [Fan et al. (2020)](https://pmc.ncbi.nlm.nih.gov/articles/PMC7331169/). |
| `flint-spiennes` | 50, 5 | Las minas neolíticas de sílex de Spiennes explotan depósitos locales en Bélgica: [UNESCO](https://whc.unesco.org/en/list/1006/). |
| `flint-levant` | 35, 35 | La disponibilidad regional queda respaldada, no un afloramiento en el centroide: [Hovers y Belfer-Cohen (2013)](https://doi.org/10.1086/673880) describen el sílex como materia prima ampliamente disponible en gran parte del Levante por su presencia en el sustrato geológico; su síntesis cita estudios de abastecimiento geológico regional. La semilla solo representa una zona amplia, no una cantera ni una fuente explotada. Para afirmar un afloramiento concreto en 35°N, 35°E haría falta cartografía geológica local o caracterización arqueométrica; no se hace esa afirmación. |
| `obsidian-lipari` | 38, 14 | Lipari fue una fuente geológica explotada en el Mediterráneo central: [Tykot (2019)](https://doi.org/10.1515/opar-2019-0007). |
| `obsidian-nemrut` | 39, 44 | Nemrut, en Anatolia oriental, es una fuente caracterizada geológica y geoquímicamente: [Robin et al. (2016)](https://doi.org/10.1016/j.jasrep.2016.08.048). |
| `copper-cyprus` | 35, 33 | El macizo de Troodos, Chipre, contiene depósitos de cobre volcanogénicos: [USGS Professional Paper 1640-A](https://pubs.usgs.gov/pp/p1640a/p1640A.pdf). La existencia geológica no fecha su explotación. |
| `copper-rio-tinto` | 37, −7 | Riotinto es un gran depósito de sulfuros metálicos de la Faja Pirítica Ibérica, con cobre: [Van Geen et al. (1997), registro USGS](https://pubs.usgs.gov/publication/70019115). |
| `copper-sinai` | 29, 34 | Minas y asentamientos de fundición de cobre de la Edad del Cobre/Bronce en el Sinaí occidental: [Library of Congress, colección de arqueología minera](https://www.loc.gov/item/2019700127/) y [UCL Digital Egypt](https://www.ucl.ac.uk/museums-static/digitalegypt/sinai/index.html). |
| `tin-cornwall` | 50, −5 | Distrito de estaño del suroeste británico: [USGS, Tin](https://pubs.usgs.gov/publication/pp1802S). La semilla no afirma una fecha de minería prehistórica concreta. |
| `tin-iberia` | 43, −8 | Galicia/noroeste ibérico y cinturón de estaño del suroeste europeo: [USGS, Tin](https://pubs.usgs.gov/publication/pp1802S). La evidencia de explotación antigua difiere por distrito y periodo. |
| `tin-erzgebirge` | 50, 13 | Región de minerales de estaño del cinturón centroeuropeo: [USGS Circular 930-J](https://pubs.usgs.gov/circ/1990/0930j/report.pdf). |
| `tin-malay` | 4, 102 | Cinturón aluvial de estaño del sudeste asiático, incluida Malasia peninsular: [USGS, Tin](https://pubs.usgs.gov/publication/pp1802S). |
| `tin-yunnan` | 25, 103 | Provincia de Yunnan, extremo norte del cinturón de estaño del sudeste asiático: [USGS, Tin](https://pubs.usgs.gov/publication/pp1802S). |
| `gold-sinai` | 25, 33 | **Abierta: etiqueta y centroide no concuerdan.** El punto está al sur de la península del Sinaí. [Surour et al. (2003)](https://doi.org/10.1016/S0375-6742(02)00268-6) documentan oro detrítico en sedimentos de wadis de Dahab, en el sudeste del Sinaí, pero no en 25°N, 33°E; [Klemm, Klemm y Murr (2001)](https://doi.org/10.1016/S0899-5362(01)00094-X) tratan los distritos auríferos del desierto oriental egipcio y Nubia, tampoco ese punto. Hace falta aclarar si se pretendía representar una zona geológica amplia o un distrito/mineralización concreta y aportar su ubicación compatible. No se cambian aquí datos ni mapas. |
| `gold-carpathians` | 47, 25 | Depósitos auríferos en montañas Metalíferas/Apuseni y otros sectores de Rumanía: [Instituto Geológico de Rumanía, mapa de recursos](https://igr.ro/publicatii/harta-resurselor-minerale-din-romania/). |
| `salt-hallstatt` | 47.56, 13.65 | El Museo de Historia Natural de Viena documenta evidencia minera prehistórica, incluidos restos de unos 7.000 años: [investigación arqueológica de Hallstatt](https://www.nhm.at/en/research/prehistory/research/hallstatt-resarch_mining). |
| `salt-wieliczka` | 49.98, 20 | Depósito de sal gema de Wieliczka-Bochnia; la UNESCO fecha la explotación minera conservada desde el siglo XIII, así que no acredita uso paleolítico: [UNESCO](https://whc.unesco.org/en/list/0032/). |
| `salt-dead-sea` | 31.5, 35.5 | La existencia geológica de halita en el sistema lacustre está respaldada: el [Geological Survey of Israel (2016)](https://www.gov.il/BlobFolder/reports/lutzky-et-al-report-2016/he/report_2016_GSI-30-2016.pdf) mide cristalización de halita actual en salmuera y [Kiro et al. (2015), USGS](https://pubs.usgs.gov/of/2015/1092/pdf/ofr2015-1092.pdf) describe depósitos gruesos de halita en testigos del Mar Muerto, incluidos intervalos interglaciales. Esto es evidencia geológica, no de extracción prehistórica ni de un depósito terrestre recolectable exactamente en 31,5°N, 35,5°E. **Abierta para uso como nodo terrestre:** falta definir si la semilla apunta a salmuera/evaporación costera o a un depósito emergido y aportar la ubicación geológica correspondiente. No se cambia aquí el dato ni el mapa. |

## Límite paleoclimático

`earth-12000-bce.bin` combina **relieve ETOPO moderno** con un nivel del mar
de −60 m, conservando la clasificación climática Köppen-Geiger moderna
(1980–2016) y las mismas semillas amplias de recursos. No es una simulación del
clima ni de la distribución de especies hace 12.000 años. El manifiesto lo
declara para que los consumidores de datos puedan distinguir la paleogeografía
aproximada de un paleoclima que todavía no está modelado.
