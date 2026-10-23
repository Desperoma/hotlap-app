-- =============================================================================
-- 0017 : couleur des véhicules ; modèles des 100 visuels ajoutés au catalogue
--
-- - vehicles.color : 15 couleurs + 'other' (affichée en gris pour l'instant), facultative.
-- - Les marques et modèles des visuels (src/data/carImageIndex.ts) entrent au catalogue s'ils
--   n'y sont pas, comme entrées vérifiées : l'import Wikidata les retrouvera par leur nom
--   normalisé (pas de doublon).
-- =============================================================================

alter table public.vehicles add column if not exists color text
  check (color in ('black', 'white', 'silver', 'grey', 'red', 'burgundy', 'orange', 'yellow', 'green',
                   'blue', 'navy', 'purple', 'brown', 'beige', 'gold', 'other'));

insert into public.vehicle_makes (name, source)
select v.name, 'import'::public.catalog_source
from (values ('Alfa Romeo'), ('Aston Martin'), ('Audi'), ('BMW'), ('Bentley'), ('Cadillac'), ('Chevrolet'), ('Dodge'), ('Ferrari'), ('Ford'), ('Genesis'), ('Honda'), ('Hyundai'), ('Infiniti'), ('Jaguar'), ('Lamborghini'), ('Land Rover'), ('Lexus'), ('Lotus'), ('Maserati'), ('Mazda'), ('McLaren'), ('Mercedes'), ('Mini'), ('Nissan'), ('Porsche'), ('Renault'), ('Subaru'), ('Tesla'), ('Toyota'), ('Volkswagen'), ('Volvo')) as v(name)
where not exists (
  select 1 from public.vehicle_makes m where m.name_key = public.catalog_key(v.name) and m.merged_into is null
);

insert into public.vehicle_models (make_id, name, source)
select mk.id, v.model, 'import'::public.catalog_source
from (values
  ('Lamborghini', 'Huracán'),
  ('Lamborghini', 'Urus'),
  ('Ferrari', 'F8 Tributo'),
  ('Porsche', '911'),
  ('Porsche', 'Taycan'),
  ('Porsche', '718 Cayman'),
  ('Mercedes', 'AMG GT'),
  ('Audi', 'R8'),
  ('Audi', 'RS 3'),
  ('Audi', 'TT RS'),
  ('BMW', 'M2'),
  ('BMW', 'M4'),
  ('BMW', 'M5'),
  ('Nissan', 'GT-R'),
  ('Nissan', 'Z'),
  ('Nissan', '370Z'),
  ('Toyota', 'GR Supra'),
  ('Toyota', 'GR86'),
  ('Toyota', 'GR Yaris'),
  ('Ford', 'Mustang'),
  ('Ford', 'Mustang Shelby GT500'),
  ('McLaren', '720S'),
  ('Aston Martin', 'Vantage'),
  ('Aston Martin', 'DB12'),
  ('Tesla', 'Model 3'),
  ('Chevrolet', 'Corvette'),
  ('Chevrolet', 'Camaro'),
  ('Mazda', 'MX-5'),
  ('Honda', 'Civic Type R'),
  ('Honda', 'NSX'),
  ('Subaru', 'WRX'),
  ('Lexus', 'IS'),
  ('Lexus', 'RC'),
  ('Dodge', 'Challenger'),
  ('Alfa Romeo', 'Giulia'),
  ('Alfa Romeo', 'Giulia Quadrifoglio'),
  ('Maserati', 'MC20'),
  ('Jaguar', 'F-Type'),
  ('Renault', 'Mégane R.S.'),
  ('Volkswagen', 'Golf R'),
  ('Mini', 'John Cooper Works'),
  ('Volvo', 'S60'),
  ('Land Rover', 'Defender'),
  ('Land Rover', 'Range Rover Sport'),
  ('Genesis', 'G70'),
  ('Bentley', 'Continental GT'),
  ('Cadillac', 'CT5-V'),
  ('Infiniti', 'Q50'),
  ('Hyundai', 'i30 N'),
  ('Lotus', 'Emira')
) as v(make, model)
join public.vehicle_makes mk on mk.name_key = public.catalog_key(v.make) and mk.merged_into is null
where not exists (
  select 1 from public.vehicle_models x
  where x.make_id = mk.id and x.name_key = public.catalog_key(v.model) and x.merged_into is null
);
