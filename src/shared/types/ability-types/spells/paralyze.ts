import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Paralyze implements IAbility {
  private static instance: Paralyze;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Paralyze";
    this.helpFile = `PARALYZE
An illusionist's spell used on others to make them think their muscles are
failing. This spell seems to have a harder time landing on the smarter
races of Algoron than on those of little brain.`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Paralyze.instance === undefined) {
      Paralyze.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Paralyze {
    if (!Paralyze.instance) {
      Paralyze.instance = new Paralyze();
    }
    return Paralyze.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Paralyze.GetInstance() as T;
  }
}

export default Paralyze;
