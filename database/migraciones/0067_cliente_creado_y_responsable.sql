-- 20 nov 2026 (pedido de Alonso): en la ficha del cliente se ve quién hizo el alta comercial y quién lleva el
-- proyecto. «Creado por» se guarda solo al crear; el responsable operativo se elige en el alta o en la ficha y
-- entra como miembro del equipo de los proyectos activos del cliente.
ALTER TABLE cliente
  ADD COLUMN creado_por               uuid REFERENCES usuario(id) ON DELETE SET NULL,
  ADD COLUMN responsable_operativo_id uuid REFERENCES usuario(id) ON DELETE SET NULL;

-- Clientes que ya existían: solo lo que se sabe con certeza.
-- Creado por: quien registró el ingreso en el alta.
UPDATE cliente c SET creado_por = (c.ingreso->>'registradoPorId')::uuid
 WHERE c.ingreso->>'registradoPorId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   AND EXISTS (SELECT 1 FROM usuario u WHERE u.id = (c.ingreso->>'registradoPorId')::uuid);
-- Responsable operativo: cuando todos sus servicios tienen el mismo responsable.
UPDATE cliente c SET responsable_operativo_id = x.responsable
  FROM (SELECT cliente_id, (array_agg(DISTINCT responsable_id))[1] AS responsable
          FROM servicio_contratado WHERE responsable_id IS NOT NULL GROUP BY cliente_id
        HAVING count(DISTINCT responsable_id) = 1) x
 WHERE x.cliente_id = c.id;
