"use strict";
/**
 * Utilitários para calendário de dias úteis brasileiros.
 * Inclui feriados nacionais de 2000 a 2035.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isBrazilianHoliday = isBrazilianHoliday;
exports.isBusinessDay = isBusinessDay;
exports.addDays = addDays;
exports.getBusinessDaysBetween = getBusinessDaysBetween;
exports.getCalendarDaysBetween = getCalendarDaysBetween;
exports.countBusinessDays = countBusinessDays;
exports.countCalendarDays = countCalendarDays;
exports.toISODate = toISODate;
exports.toBCBDate = toBCBDate;
exports.parseBCBDate = parseBCBDate;
exports.lastBusinessDayOn = lastBusinessDayOn;
exports.daysInMonth = daysInMonth;
/**
 * Feriados nacionais fixos e móveis do Brasil (2000-2035).
 * Formato: 'YYYY-MM-DD'
 */
const BRAZILIAN_HOLIDAYS_FIXED_RULES = [
    // Feriados fixos (mês-dia)
    '01-01', // Confraternização Universal (Ano Novo)
    '04-21', // Tiradentes
    '05-01', // Dia do Trabalho
    '09-07', // Independência do Brasil
    '10-12', // Nossa Senhora Aparecida
    '11-02', // Finados
    '11-15', // Proclamação da República
    '12-25', // Natal
];
/**
 * Calcula a Páscoa pelo algoritmo de Butcher (Anonymous Gregorian algorithm).
 */
function easterDate(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
}
/**
 * Gera a lista de feriados móveis para um determinado ano.
 * Inclui Carnaval, Sexta-feira Santa, Corpus Christi.
 */
function getMobileHolidays(year) {
    const easter = easterDate(year);
    const result = [];
    const addOffset = (base, offset) => {
        const d = new Date(base);
        d.setDate(d.getDate() + offset);
        return d.toISOString().slice(0, 10);
    };
    result.push(addOffset(easter, -48)); // Segunda-feira de Carnaval
    result.push(addOffset(easter, -47)); // Terça-feira de Carnaval
    result.push(addOffset(easter, -2)); // Sexta-feira Santa (Paixão)
    result.push(addOffset(easter, 0)); // Páscoa (domingo — afeta segunda)
    result.push(addOffset(easter, 60)); // Corpus Christi
    return result;
}
/** Cache de feriados por ano */
const holidayCache = new Map();
/**
 * Retorna o conjunto de feriados nacionais para um ano.
 * @param year Ano (2000-2035)
 */
function getHolidaysForYear(year) {
    if (holidayCache.has(year)) {
        return holidayCache.get(year);
    }
    const holidays = new Set();
    // Feriados fixos
    for (const rule of BRAZILIAN_HOLIDAYS_FIXED_RULES) {
        holidays.add(`${year}-${rule}`);
    }
    // Feriados móveis
    for (const h of getMobileHolidays(year)) {
        holidays.add(h);
    }
    holidayCache.set(year, holidays);
    return holidays;
}
/**
 * Verifica se uma data é feriado nacional brasileiro.
 */
function isBrazilianHoliday(date) {
    const iso = toISODate(date);
    const year = date.getFullYear();
    return getHolidaysForYear(year).has(iso);
}
/**
 * Verifica se uma data é dia útil (não é sábado, domingo ou feriado nacional).
 */
function isBusinessDay(date) {
    const dow = date.getDay();
    if (dow === 0 || dow === 6)
        return false; // Domingo ou Sábado
    return !isBrazilianHoliday(date);
}
/**
 * Adiciona n dias a uma data.
 */
function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
}
/**
 * Retorna todos os dias úteis entre duas datas (inclusive startDate, exclusive endDate).
 * Padrão do mercado brasileiro: o dia inicial conta, o dia final não conta.
 */
function getBusinessDaysBetween(startDate, endDate) {
    const days = [];
    let current = new Date(startDate);
    current.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);
    while (current < end) {
        if (isBusinessDay(current)) {
            days.push(new Date(current));
        }
        current = addDays(current, 1);
    }
    return days;
}
/**
 * Retorna todos os dias corridos entre duas datas (inclusive startDate, exclusive endDate).
 */
function getCalendarDaysBetween(startDate, endDate) {
    const days = [];
    let current = new Date(startDate);
    current.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);
    while (current < end) {
        days.push(new Date(current));
        current = addDays(current, 1);
    }
    return days;
}
/**
 * Conta o número de dias úteis entre duas datas.
 */
function countBusinessDays(startDate, endDate) {
    return getBusinessDaysBetween(startDate, endDate).length;
}
/**
 * Conta o número de dias corridos entre duas datas.
 */
function countCalendarDays(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}
/**
 * Formata uma data como 'YYYY-MM-DD' (ISO).
 */
function toISODate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}
/**
 * Formata uma data como 'DD/MM/YYYY' (padrão BCB).
 */
function toBCBDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${d}/${m}/${y}`;
}
/**
 * Parseia uma data no formato 'DD/MM/YYYY' (padrão BCB).
 */
function parseBCBDate(str) {
    const [d, m, y] = str.split('/').map(Number);
    return new Date(y, m - 1, d);
}
/**
 * Retorna o último dia útil anterior ou igual a uma data.
 */
function lastBusinessDayOn(date) {
    let d = new Date(date);
    d.setHours(0, 0, 0, 0);
    while (!isBusinessDay(d)) {
        d = addDays(d, -1);
    }
    return d;
}
/**
 * Retorna o número de dias no mês de uma data.
 */
function daysInMonth(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}
//# sourceMappingURL=businessDays.js.map