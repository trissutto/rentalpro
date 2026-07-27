import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const CRON_SECRET = process.env.CRON_SECRET ?? "eae1c76e0dee304f3abe0437f55e553b30573eaa";

// Conteúdo real coletado dos anúncios do Airbnb em 27/07/2026
const CONTENT: {
  match: string[];
  data: {
    description: string; rules: string; amenities: string[];
    capacity: number; maxGuests: number; bedrooms: number; bathrooms: number;
    checkInTime: string; checkOutTime: string; photos: string[]; ical: string;
  };
}[] = [
  {
    "match": [
      "coqueiros"
    ],
    "data": {
      "description": "CASA ITANHAÉM COM QUADRA DE VÔLEI, PISCINA E CHURRASQUEIRA\n\nTerreno de 1200 m² — até 30 pessoas, a 3 quadras da praia, na rua dos pontos turísticos da cidade.\n\nA casa conta com piscina grande, quadra de vôlei de praia, mesa de bilhar, churrasqueira e forno de pizza na área gourmet, redário para descanso e vaga para até 8 carros.\n\nSão 7 quartos (2 suítes) e 5 banheiros, sala com 2 ambientes, 2 cozinhas totalmente equipadas com freezer de 250 litros. Todos os quartos com ventiladores de controle remoto. Wi-Fi de 800 megas e sistema de segurança.\n\nBairro residencial super seguro, ao lado da escola 22 de Abril e perto dos principais pontos turísticos de Itanhaém.",
      "rules": "Não fornecemos roupas de cama nem toalhas. Capacidade máxima de 30 pessoas. Não é permitido fumar dentro da casa. Respeitar as leis da cidade relativas à perturbação do sossego e o limite de som. Check-in após 14:00 · Checkout até 11:00.",
      "amenities": [
        "Piscina grande",
        "Quadra de vôlei de praia",
        "Mesa de bilhar",
        "Churrasqueira",
        "Forno de pizza",
        "2 cozinhas equipadas",
        "Freezer 250 litros",
        "Wi-Fi 800 megas",
        "Redário",
        "Caixa de som",
        "Sistema de segurança",
        "Vaga para 8 carros",
        "Ventiladores com controle remoto",
        "Chuveiro externo"
      ],
      "capacity": 30,
      "maxGuests": 30,
      "bedrooms": 7,
      "bathrooms": 5,
      "checkInTime": "14:00",
      "checkOutTime": "11:00",
      "photos": [
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1516790046266940919/original/3031227e-6447-4e25-98c1-a428f44b556e.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1516790046266940919/original/2736ec92-af0b-4dba-bb6e-187d2f952b19.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1516790046266940919/original/1036c6c8-7116-42fd-9ef6-1418e493af7f.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1516790046266940919/original/84f3a5e0-8fe0-486b-9da4-2e1cfb880de4.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1516790046266940919/original/e47214cd-6be0-4490-a7fa-7349fc616f12.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1516790046266940919/original/afa3e63a-bc8d-4f24-820b-760a51f1daa0.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1516790046266940919/original/e027091d-b2ba-4a73-89ac-21b889dcb5b0.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1516790046266940919/original/84d3cd09-c7c2-46c1-b7f5-88fd85932c20.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1516790046266940919/original/f89b9b27-0a2f-4dba-b831-a219d38de178.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1516790046266940919/original/23b17e9a-fa18-4886-a64a-29325fd183f6.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1516790046266940919/original/e4a540cf-7ca1-4017-ad23-03a216380ac9.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1516790046266940919/original/d5f517d9-57bf-458e-8647-88a446f27972.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1516790046266940919/original/3b18f927-9898-41c0-aaa0-45765fd59cee.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1516790046266940919/original/5a244f02-cb4c-4113-9e60-ee8cacadc1c8.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1516790046266940919/original/a96944a0-2c99-46cc-94b0-2a75da7c3f76.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1516790046266940919/original/c2ebea4f-caae-474b-8df7-37914f6779f2.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1516790046266940919/original/d775f317-34ef-40c6-8615-387e880d852b.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1516790046266940919/original/6c1e697d-2a7c-4c3d-82eb-a353e8826452.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1516790046266940919/original/7229579c-38fe-4777-b4ab-0b3cd8d8883a.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1516790046266940919/original/e7a75517-2515-4470-8962-5f38340bf727.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1516790046266940919/original/18d5307d-06f4-40b8-b338-7431c0e163d4.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1516790046266940919/original/d07c6cdc-4aa8-430c-8a27-9a40458abb6a.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1516790046266940919/original/fc8daf97-ed80-4e5d-b7f8-4309faed08b2.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1516790046266940919/original/f3ec9962-b0e7-4a0b-a35d-5c2885278fae.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1516790046266940919/original/ab57b8f3-4c99-48f1-a99d-0b39d28cd84c.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1516790046266940919/original/c01fba87-0a7f-42e4-90c6-3aefc02b2e46.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1516790046266940919/original/567ef293-c0b8-44fb-bcd2-8a04275eb0f6.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1516790046266940919/original/02cf6b80-0cea-4691-9f11-0d3ba742b0b7.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1516790046266940919/original/55f7ec7e-2865-4944-9f62-6ceeea93183a.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1516790046266940919/original/ea375669-891d-4d0d-b835-5136028f8cb1.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1516790046266940919/original/3a051d55-1f03-4c7d-9e48-e3381bd5b631.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1516790046266940919/original/95f7a7e3-824c-4b36-aab1-8db7c3d159db.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1516790046266940919/original/7ae7769e-eb6f-4c45-acee-01bea0d7a4fc.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1516790046266940919/original/24e976a3-5b01-4cdd-b638-435103f17225.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1516790046266940919/original/689a522b-d0a6-403e-adb2-50299b671705.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1516790046266940919/original/608b702a-bf94-49be-bb14-64939d4d9aa2.jpeg"
      ],
      "ical": "https://www.airbnb.com.br/calendar/ical/1516790046266940919.ics?t=d8f26f116ec04248bc05afcefa2ae540"
    }
  },
  {
    "match": [
      "boca da barra"
    ],
    "data": {
      "description": "Viva a experiência de se hospedar em uma casa pé na areia, com piscina privativa, no melhor ponto de Itanhaém. No centro da cidade, com tudo perto e o mar aos seus pés.\n\nAqui você estaciona o carro, esquece a rotina e aproveita praia, conforto e praticidade em um só lugar.\n\nSala de 3 ambientes, cozinha completa e equipada, 3 suítes + 1 quarto com ar-condicionado, 2 banheiros extras, sacada com vista para o mar, churrasqueira e vaga para 4 carros. Wi-Fi de 800 megas e sistema de segurança.\n\nNa área externa, o grande destaque é a piscina privativa. A localização é privilegiada: praia, restaurantes, mercados e comércios a poucos passos. Check-in autônomo por cofre de chaves.",
      "rules": "Não é permitido realizar festas ou eventos. Respeitar o horário de silêncio (após 23h). Não exceder o número de hóspedes da reserva. Não sentar em sofás molhados após a piscina. Crianças sempre supervisionadas na área da piscina. Check-in após 17:00 · Checkout até 15:00.",
      "amenities": [
        "Pé na areia",
        "Piscina privativa",
        "Ar-condicionado",
        "Sacada com vista mar",
        "Churrasqueira",
        "Sala 3 ambientes",
        "Cozinha equipada",
        "Self check-in",
        "Wi-Fi 800 megas",
        "Sistema de segurança",
        "Vaga para 4 carros",
        "Acesso direto à praia"
      ],
      "capacity": 16,
      "maxGuests": 16,
      "bedrooms": 4,
      "bathrooms": 5,
      "checkInTime": "17:00",
      "checkOutTime": "15:00",
      "photos": [
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/22f02821-d2ff-4866-9ec0-897baa0f9557.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/b0269ae7-abad-4765-8340-299bee43688f.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/1ea6e2b5-060a-4f08-96bb-a52b4de2dbdb.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/f82c4aa6-870d-4f0f-ad83-6ca8849fafbb.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/66dfb412-c589-4965-b36c-b1bb9b5e2cb0.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/4e4cc483-1167-4b99-9988-0bccf06a185e.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/a39c4b8b-5c4b-4e32-b8a5-8bae52236b4f.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/6ce3cddd-5b15-49aa-9884-a5cfdd896a19.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/02004659-6f2e-47a3-a752-911808a5eb25.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/f32e4584-4191-43f1-9e74-78071ebd91a7.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/79994dd1-0457-4b40-98fb-81b12fb8b00c.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/dc006c5d-2133-48e8-b109-da5c42f07f63.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/1c958f9e-1546-40f4-86e2-65d97f451d95.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/4079949f-6713-491b-8506-e205e1012280.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/5d7c3a17-8f94-45b3-baa3-af391f5cdeba.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/47d917e9-3e06-420b-8f81-7d306121caec.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/a535128e-a773-41e3-b682-8451ebd3517e.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/43ae36bd-f886-4527-a0aa-aa801ec05fdf.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/8ee76c12-ec4c-4a3d-bbc2-76956e97fe88.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/58eb0299-a489-492b-9104-ced2b4bdf96c.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/4055b075-f421-4a53-b00b-712a8c81c347.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/c9bb4fbc-87fa-4900-93b8-39b0793a93be.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/31fd6c27-8075-4836-b1c3-911c37108a13.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/de5e2e37-38da-4286-9395-fa042e0da8a1.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/a2e5c5de-c86f-498d-882a-e55bf5f35e77.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/bd4ace06-0a62-4950-b4b9-c45e29b03290.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/0f1a0ae2-fc6d-423e-b33c-4e0aa2bea96c.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/5423ea7b-cadd-4920-9616-eff3fc183e3d.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/7af0add1-9f01-4e12-9355-51df5c889663.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/6182d61d-2b50-414e-92ea-01982aecd5a9.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/410a8f7c-44ba-4201-925c-d158ebb74ee7.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/2c91ecb7-fc78-4543-aebe-279282a6467d.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/5d97e9c5-e4c5-40f0-bd97-fa3420a014a4.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/c1d9216d-5666-4b10-af95-a7957e02ac01.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/23d3d855-fc29-4025-9ad7-f66773bdce79.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/f9f50dba-d340-4e21-837d-521f12190bf6.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/490a04ae-5872-48af-84d0-807b737e0d04.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/e4c96492-d83f-43a5-ba73-ab1dace1816c.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/192143f9-946c-477d-b8b8-c480cb68cbc7.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/38f798ee-6a5c-4ec2-901a-201cbc9ece0d.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/584a4369-6c36-4568-80f8-98e4ebfbf48b.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/96549b62-097c-4523-beb9-4f6f3edcab8a.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/28959784-8845-4424-bd9b-d20a6dcda821.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/63f40df1-e397-4ccd-81de-e1de4f195ce1.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/ef30d6f3-90ce-4c75-a578-8cb32f863aca.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/783e912a-c5cb-4b90-9f65-fa34ab74475c.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/b2af9e10-7a93-4714-ad9e-526ad564fcc8.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/282bf9c3-857f-4a58-974d-ac2d6af47a07.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/9d1b84ec-aceb-4e33-9d05-b2f2e0112f85.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/46594abc-7141-4102-a9bb-b7d5d4cad5aa.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1605210721496160709/original/a09c52d3-2097-47ca-90cd-7574bbe29488.jpeg"
      ],
      "ical": "https://www.airbnb.com.br/calendar/ical/1605210721496160709.ics?t=72a9da4b6bc543308455481bd59d0191"
    }
  },
  {
    "match": [
      "guarani",
      "635"
    ],
    "data": {
      "description": "Hospede-se com conforto no melhor bairro de Itanhaém, na charmosa Praia dos Sonhos!\n\nCasa completa com 3 suítes com ar-condicionado, piscina privativa, ampla área gourmet e garagem para até 4 carros. Conta ainda com um belo jardim para relaxar.\n\nLocalização privilegiada, próxima à praia e ao comércio local. Ideal para famílias e grupos que buscam conforto, lazer e praticidade.\n\nSeu pet é bem-vindo. Casa novinha. Venha viver momentos maravilhosos no Guarani Residence 635.",
      "rules": "Máximo de 9 hóspedes. Pets são bem-vindos. Check-in após 15:00.",
      "amenities": [
        "Piscina privativa",
        "Ar-condicionado nas suítes",
        "Área gourmet",
        "Churrasqueira",
        "Jardim",
        "Aceita pets",
        "Garagem para 4 carros",
        "Cozinha equipada",
        "Casa nova"
      ],
      "capacity": 9,
      "maxGuests": 9,
      "bedrooms": 3,
      "bathrooms": 4,
      "checkInTime": "15:00",
      "checkOutTime": "12:00",
      "photos": [
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1670400598096872307/original/9f99113c-c138-49da-b3f3-b5136b9b2358.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1670400598096872307/original/2e6bf52f-c181-4bca-b852-33065a29312c.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1670400598096872307/original/31fe4d33-eb30-4ff3-85a5-6e70f06a1c25.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1670400598096872307/original/9c13dadb-11c4-46a0-89bc-efb0716d330b.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1670400598096872307/original/0d5f7670-5eaf-4579-9096-ff976c924ae9.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1670400598096872307/original/b6cbb186-f257-48c9-9f92-71d17e9e3670.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1670400598096872307/original/84a64edd-a2eb-44c2-8d25-4477ed364846.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1670400598096872307/original/86e4e323-f824-4982-9c5d-8388348f4f90.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1670400598096872307/original/4dc3935f-15f3-4b26-b862-0ddb885cf44c.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1670400598096872307/original/3b279da9-76b3-4226-9431-a7eb29906f5b.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1670400598096872307/original/a12de578-f0e5-4e7b-b956-c90c9c4ddfc8.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1670400598096872307/original/ffbd912c-1447-4cde-ae45-927fb5b8d511.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1670400598096872307/original/ea919660-a83e-4711-b493-d6078f79fd25.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1670400598096872307/original/f98319bc-e197-4d58-875e-0fa6d54a50e5.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1670400598096872307/original/5b0d3ced-ab76-431c-8ef2-271d83ebff2e.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1670400598096872307/original/3cc833ec-d74c-4492-8011-f039e8f37dd3.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1670400598096872307/original/0364fd73-45bb-42ff-ab68-2bcd3cb1e2f9.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1670400598096872307/original/98f56143-6d2e-4d1c-aa0e-ab8343021d75.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1670400598096872307/original/9fbacd7a-4127-42c3-945e-8620e6fe8c24.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1670400598096872307/original/81cb6c5b-51ef-4575-aaf2-2f1fd9a0a099.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1670400598096872307/original/3bc5068a-99bf-4555-9a1e-98115d405e62.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1670400598096872307/original/749d2a87-1768-434c-bbce-c70c81041568.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1670400598096872307/original/486463af-70b5-4c5a-89be-f6f17102b209.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1670400598096872307/original/c3600027-7622-4b21-8fca-fe6eda7f1cd0.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1670400598096872307/original/1b88a0b0-d794-4ccf-94b2-2a9e3fd7402f.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1670400598096872307/original/d976710c-bc7b-4163-92dc-7c61eacafa4d.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1670400598096872307/original/11654e2e-8abe-4a8b-9c94-6e4b7fd201f8.jpeg",
        "https://a0.muscache.com/im/pictures/hosting/Hosting-1670400598096872307/original/f0c1c986-b6e5-4843-aefc-b317c3aa589e.jpeg"
      ],
      "ical": "https://www.airbnb.com.br/calendar/ical/1670400598096872307.ics?t=e5e7d25f1460403c97b5b31e74e45206"
    }
  }
];

/**
 * GET /api/admin/sync-airbnb-content?secret=XXX
 * Aplica descrições, fotos, comodidades e link iCal do Airbnb
 * nas propriedades correspondentes. Idempotente — pode rodar mais de uma vez.
 */
export async function GET(req: NextRequest) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (secret !== CRON_SECRET) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const props = await prisma.property.findMany();
  const report: { property: string; matched: string | null; updated: boolean }[] = [];

  for (const c of CONTENT) {
    const prop = props.find(p => {
      const n = p.name.toLowerCase();
      return c.match.some(m => n.includes(m));
    });
    if (!prop) {
      report.push({ property: c.match.join("/"), matched: null, updated: false });
      continue;
    }

    // Mesclar icalUrls: mantém entradas não-airbnb, substitui/adiciona a do Airbnb
    let icalUrls: { url: string; label: string; source: string }[] = [];
    try { icalUrls = JSON.parse(prop.icalUrls ?? "[]"); } catch { icalUrls = []; }
    icalUrls = icalUrls.filter(e => e.source !== "airbnb");
    icalUrls.push({ url: c.data.ical, label: "Airbnb", source: "airbnb" });

    await prisma.property.update({
      where: { id: prop.id },
      data: {
        description:  c.data.description,
        rules:        c.data.rules,
        amenities:    JSON.stringify(c.data.amenities),
        photos:       JSON.stringify(c.data.photos),
        coverPhoto:   c.data.photos[0] ?? prop.coverPhoto,
        capacity:     c.data.capacity,
        maxGuests:    c.data.maxGuests,
        bedrooms:     c.data.bedrooms,
        bathrooms:    c.data.bathrooms,
        checkInTime:  c.data.checkInTime,
        checkOutTime: c.data.checkOutTime,
        icalUrls:     JSON.stringify(icalUrls),
      },
    });
    report.push({ property: prop.name, matched: c.match.join("/"), updated: true });
  }

  return NextResponse.json({ ok: true, report });
}
