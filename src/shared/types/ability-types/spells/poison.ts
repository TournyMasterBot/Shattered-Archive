import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Poison implements IAbility {
  private static instance: Poison;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Poison";
    this.helpFile = `help poison
POISON
POISON

Syntax: cast poison <victim>
Syntax: cast poison <object>
This spell reduces the strength of the victim by two, as well as reducing the
victim's regeneration rate. It may also be used to poison food, drink, or
a weapon in a fashion similar to envenom ('help envenom'), but with 
drastically reduced effectiveness.`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Poison.instance === undefined) {
      Poison.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Poison {
    if (!Poison.instance) {
      Poison.instance = new Poison();
    }
    return Poison.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Poison.GetInstance() as T;
  }
}

export default Poison;
