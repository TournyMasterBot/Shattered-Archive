import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Meteo implements IAbility {
  private static instance: Meteo;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = "Meteo";
    this.helpFile = `
meteo
Syntax: cast 'meteo'

Meteo is perhaps the most powerful attack spell the gods have bestowed upon
priests. A shower of meteors from the heavens rains down upon the victims
who are not grouped with the priest. Any number of meteors can attack a
given victim.
        `;
    this.manualDescription =
      "Meteo is the sole purview of the High Priest of a god. Only one high priest is allowed per god, and expect the road to last a decade or more in real life time.";
    this.abilityGroupType = AbilityGroupType.Spells; // Set to 'Spells'
    this.abilityUsage = AbilityUsage.Active;

    if (Meteo.instance === undefined) {
      Meteo.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Meteo {
    if (!Meteo.instance) {
      Meteo.instance = new Meteo();
    }
    return Meteo.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Meteo.GetInstance() as T;
  }
}

export default Meteo;
