-- Optional: GridConnection table (not in original dump, but referenced by app)
USE CarbonNeutralEnergyDB;

CREATE TABLE IF NOT EXISTS GridConnection (
  connection_id INT NOT NULL AUTO_INCREMENT,
  plant_id INT NULL,
  grid_id INT NULL,
  connected_on DATE NULL,
  PRIMARY KEY (connection_id),
  KEY plant_id (plant_id),
  KEY grid_id (grid_id),
  CONSTRAINT fk_gc_plant FOREIGN KEY (plant_id) REFERENCES PowerPlant(plant_id),
  CONSTRAINT fk_gc_grid FOREIGN KEY (grid_id) REFERENCES TransmissionGrid(grid_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
