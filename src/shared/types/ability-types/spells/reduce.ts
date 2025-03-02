import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Reduce implements IAbility {
  private static instance: Reduce;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
ENLARGE REDUCE

Syntax:  cast 'enlarge'
         cast 'reduce'

These spells enlarge or reduce the size of the caster.

See also - ALTERATION TRANSMUTER
        `;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Reduce.instance === undefined) {
      Reduce.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Reduce {
    if (!Reduce.instance) {
      Reduce.instance = new Reduce();
    }
    return Reduce.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Reduce.GetInstance() as T;
  }
}

export default Reduce;
