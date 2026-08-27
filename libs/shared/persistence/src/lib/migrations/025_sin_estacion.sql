-- La estación se va: la cocina filtra y rotula por la sección de la carta.
--
-- Era una segunda clasificación de los platos —parrilla, fríos, barra,
-- postres— que nadie cargaba, en paralelo a las categorías que el restaurante
-- ya escribe para su carta. El tablero terminaba mostrando FRÍO en el café y
-- en la empanada, y el admin pedía llenar un campo que no le decía nada.
--
-- La sección responde lo mismo sin trabajo extra, y encima con las palabras
-- del local: "Empanadas" y no "COLD".
ALTER TABLE products DROP COLUMN IF EXISTS station;
