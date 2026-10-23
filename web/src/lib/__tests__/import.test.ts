import { describe, expect, it } from "vitest";
import { seedDatabase, type SchoolClass } from "@edunazorat/shared";

import { buildRows, classKey, guessMapping, parseDay } from "../import/map";
import { parseCsv } from "../import/read";

const db = seedDatabase(new Date(2026, 9, 8).getTime());
const classes: SchoolClass[] = db.classes.filter((c) => c.institutionId === "inst_school");
const existing = db.students.filter((s) => s.institutionId === "inst_school");

describe("fayldan o'quvchilar: ustunlar va qatorlar", () => {
  const table = [
    ["Maktab ro'yxati", "", "", "", "", "", "", ""],
    ["№", "F.I.Sh", "Sinfi", "Tug'ilgan sana", "Ota-onasi", "Ota-ona telefoni", "O'quvchi telefoni", "Manzil"],
    ["1", "Aliyev Jasur", "5-A", "2015-04-12", "Aliyeva Malika", "+998 90 123 45 01", "", "Chilonzor"],
    ["2", "Karimova Nilufar", "7 b", "03.09.2013", "Karimov Botir", "901234502", "93 111 22 03", ""],
    ["3", "Rahimov Sardor", "5A", "", "Rahimova Dilfuza 90-123-45-04", "", "", ""],
    ["4", "Tursunov Bek", "10-V", "", "", "", "", ""],
    ["5", "Aziz Karimov", "5-A", "", "", "", "", ""],
    ["6", "Olimova Zarina", "7-B", "31.02.2014", "Olimov", "12345", "", ""],
    ["7", "Aliyev Akmal", "7-B", "", "Aliyeva Malika", "+998901234501", "", ""],
  ];

  it("sarlavhani topadi, ortiqcha ustunni tashlaydi, sinfni har xil yozuvda taniydi", () => {
    const m = guessMapping(table, classes);
    expect(m.headerRow).toBe(1);
    expect(m.fields).toEqual(["skip", "name", "class", "birthDay", "parentName", "parentPhone", "studentPhone", "skip"]);
    expect(classKey("7 b")).toBe(classKey("7-B"));
    expect(classKey("7-Б")).not.toBe(""); // kirill
  });

  it("qatorlar: tayyor, izohli, xato, takror", () => {
    const rows = buildRows(table, guessMapping(table, classes), classes, existing, "");
    const by = (n: number) => rows.find((r) => r.line === n)!;
    expect(by(3)).toMatchObject({ status: "ok", input: { name: "Aliyev Jasur", classId: "c_5a", birthDay: "2015-04-12", parents: [{ name: "Aliyeva Malika", phone: "998901234501" }] } });
    expect(by(4)).toMatchObject({ status: "ok", input: { classId: "c_7b", birthDay: "2013-09-03", studentPhone: "998931112203" } });
    // Ism va telefon bitta katakda
    expect(by(5).input!.parents).toEqual([{ name: "Rahimova Dilfuza", phone: "998901234504" }]);
    expect(by(6)).toMatchObject({ status: "error", notes: ["import.noClass"] });
    expect(by(7).status).toBe("duplicate");
    expect(by(8)).toMatchObject({ status: "warn" });
    expect(by(8).notes).toEqual(expect.arrayContaining(["import.badDate", "import.badPhone"]));
    expect(by(8).input!.birthDay).toBeUndefined();
    expect(rows.filter((r) => r.status === "ok" || r.status === "warn").length).toBe(5);
  });

  it("sarlavhasiz ro'yxat (mazmun bo'yicha) va sinf faylda bo'lmasa — tanlangan sinf", () => {
    const plain = [["Aliyev Jasur", "Aliyeva Malika", "90 123 45 01"], ["Karimova Nilufar", "Karimov Botir", "90 123 45 02"]];
    const m = guessMapping(plain, classes);
    expect(m.headerRow).toBe(-1);
    expect(m.fields).toEqual(["name", "parentName", "parentPhone"]);
    expect(buildRows(plain, m, classes, existing, "")[0]).toMatchObject({ status: "error", notes: ["import.chooseClass"] });
    expect(buildRows(plain, m, classes, existing, "c_5a")[1]).toMatchObject({ status: "ok", input: { classId: "c_5a" } });
  });

  it("sana va CSV", () => {
    expect(parseDay("12.04.2015")).toBe("2015-04-12");
    expect(parseDay("1/2/15")).toBe("2015-02-01");
    expect(parseDay("2015-13-01")).toBeNull();
    expect(parseCsv('F.I.Sh;Sinf\n"Aliyev; Jasur";5-A\n')).toEqual([["F.I.Sh", "Sinf"], ["Aliyev; Jasur", "5-A"]]);
  });
});
