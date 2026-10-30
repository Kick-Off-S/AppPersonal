// Comercios y empresas comunes en Chile con su categoría de gasto. Al escribir el detalle de un gasto
// se sugieren y completan la categoría. Primero manda el historial del usuario (la última categoría
// que usó para ese nombre); si no hay, esta lista.
import { state } from './store.js';

export const CATEGORIES = [
  'Supermercado',
  'Comida fuera',
  'Delivery',
  'Transporte',
  'Combustible',
  'Arriendo / Vivienda',
  'Cuentas básicas',
  'Telefonía e internet',
  'Suscripciones',
  'Salud',
  'Educación',
  'Ocio',
  'Ropa',
  'Tiendas',
  'Hogar',
  'Mascotas',
  'Cuidado personal',
  'Viajes',
  'Regalos',
  'Deudas / Créditos',
  'Otros',
];

const LIST = {
  Supermercado: ['Lider', 'Jumbo', 'Santa Isabel', 'Unimarc', 'Tottus', 'Acuenta', 'Mayorista 10', 'Alvi', 'Ekono', 'OK Market', 'Oxxo', 'Super 10', 'Feria', 'Almacén', 'Panadería', 'Verdulería', 'Carnicería'],
  'Comida fuera': ["McDonald's", 'Burger King', 'KFC', 'Starbucks', 'Juan Maestro', 'Doggis', 'Telepizza', "Domino's", "Papa John's", 'Pizza Hut', 'Dominó', 'Tarragona', 'Subway', 'Melt Pizzas', 'Sushi', 'Café', 'Restaurant', 'Almuerzo'],
  Delivery: ['Uber Eats', 'PedidosYa', 'Rappi', 'Justo'],
  Transporte: ['Metro', 'Bip!', 'Red Movilidad', 'Micro', 'Uber', 'Cabify', 'DiDi', 'inDrive', 'Taxi', 'Colectivo', 'EFE', 'Turbus', 'Pullman Bus', 'TAG autopistas', 'Estacionamiento', 'Revisión técnica', 'Permiso de circulación', 'Mecánico'],
  Combustible: ['Copec', 'Shell', 'Aramco', 'Bencina', 'Diésel'],
  'Arriendo / Vivienda': ['Arriendo', 'Dividendo', 'Gastos comunes', 'Contribuciones'],
  'Cuentas básicas': ['Enel', 'CGE', 'Chilquinta', 'Aguas Andinas', 'Esval', 'Essbio', 'Nuevosur', 'Aguas del Valle', 'Metrogas', 'Lipigas', 'Abastible', 'Gasco', 'Luz', 'Agua', 'Gas'],
  'Telefonía e internet': ['Entel', 'Movistar', 'WOM', 'Claro', 'VTR', 'Mundo', 'GTD', 'Internet', 'Plan celular'],
  Suscripciones: ['Netflix', 'Spotify', 'Disney+', 'Max', 'Prime Video', 'YouTube Premium', 'Apple', 'iCloud', 'Google One', 'Paramount+', 'Xbox Game Pass', 'PlayStation Plus', 'ChatGPT', 'Gimnasio', 'Smart Fit', 'Sportlife', 'Pacific Fitness', 'Energy'],
  Salud: ['Cruz Verde', 'Salcobrand', 'Farmacias Ahumada', 'Dr. Simi', 'Farmacia', 'Fonasa', 'Isapre', 'Colmena', 'Banmédica', 'Cruz Blanca', 'Consalud', 'Vida Tres', 'Nueva Masvida', 'Integramédica', 'RedSalud', 'Megasalud', 'Clínica', 'Dentista', 'Óptica', 'Examen', 'Consulta médica'],
  Educación: ['Colegio', 'Universidad', 'Instituto', 'Jardín infantil', 'Matrícula', 'Libros', 'Útiles escolares', 'Udemy', 'Duolingo'],
  Ocio: ['Cinemark', 'Cineplanet', 'Ticketmaster', 'Puntoticket', 'Passline', 'Bar', 'Concierto', 'Steam', 'Juegos'],
  Ropa: ['H&M', 'Zara', 'Tricot', 'Corona', 'Adidas', 'Nike', 'Bata', 'Zapatos', 'Ropa'],
  Tiendas: ['Falabella', 'Ripley', 'Paris', 'Hites', 'La Polar', 'Mercado Libre', 'AliExpress', 'Temu', 'Shein', 'Amazon', 'PC Factory', 'Abcdin', 'Lápiz López'],
  Hogar: ['Sodimac', 'Easy', 'Construmart', 'IKEA', 'Casaideas', 'Ferretería', 'Lavandería'],
  Mascotas: ['Club de Perros y Gatos', 'Superzoo', 'Pet Happy', 'Veterinaria', 'Alimento mascota'],
  'Cuidado personal': ['Preunic', 'Maicao', 'Peluquería', 'Barbería', 'Manicure'],
  Viajes: ['LATAM', 'Sky Airline', 'JetSMART', 'Airbnb', 'Booking', 'Hotel'],
  Regalos: ['Regalo', 'Cumpleaños'],
  'Deudas / Créditos': ['Crédito de consumo', 'Avance en efectivo', 'Pago tarjeta'],
};

export const MERCHANTS = Object.entries(LIST).flatMap(([cat, names]) => names.map((name) => ({ name, cat })));

// Para comparar sin mayúsculas, tildes ni signos: "Mc Donald's" ≈ "mcdonalds".
export const key = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const BY_KEY = new Map(MERCHANTS.map((m) => [key(m.name), m]));

// Categoría para un detalle escrito: historial del usuario, luego la lista (nombre exacto o que empiece
// con un comercio conocido, p. ej. "Lider Express Ñuñoa" → Supermercado).
export function categoryFor(desc) {
  const k = key(desc);
  if (k.length < 2) return '';
  const mine = [...state.finance.expenses, ...state.finance.fixed]
    .filter((e) => key(e.desc || e.name) === k && e.cat)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0];
  if (mine) return mine.cat;
  if (BY_KEY.has(k)) return BY_KEY.get(k).cat;
  const hit = MERCHANTS.find((m) => key(m.name).length >= 3 && k.startsWith(key(m.name)));
  return hit ? hit.cat : '';
}

// Sugerencias para el campo "detalle": lo que el usuario ya usó primero, luego la lista.
export const merchantNames = () => [...new Set([...state.finance.expenses.map((e) => e.desc).filter(Boolean), ...MERCHANTS.map((m) => m.name)])];
