// Reglas compartidas para tratar el estado físico de los objetos sin
// confundirlo con el estado operativo de una publicación.
(function exposeItemCondition(root) {
  const CONDITION_VALUES = Object.freeze(["Como nuevo", "Bueno", "Aceptable", "Roto"]);
  const VALUE_SET = new Set(CONDITION_VALUES);

  function normalize(value) {
    const candidate = String(value ?? "").trim();
    return VALUE_SET.has(candidate) ? candidate : "";
  }

  function isValid(value) {
    return Boolean(normalize(value));
  }

  function format(value) {
    const condition = normalize(value);
    return condition ? `Estado: ${condition}` : "Estado no indicado";
  }

  root.SecondaVidaItemCondition = Object.freeze({
    CONDITION_VALUES,
    normalize,
    isValid,
    format,
  });
}(typeof window === "undefined" ? globalThis : window));
