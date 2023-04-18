import { I18n, i18n, createArrayBuilder, I } from "@yuuza/webfx";
import data from "./i18n-data.json";

export { I18n, i18n, I };

export const IA = createArrayBuilder(i18n);

data.forEach((x) => i18n.add2dArray(x));
