import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class EngulfWind implements IAbility {
  private static instance: EngulfWind;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help wujen
Engulf Wind - Drawing a great deal of air into their bodies, a Wu Jen is
able to harness the power of wind to grow to a greater size, pushing
themselves to their limits.  While enlarged, they are more resistant to
being bashed and other forms of stunning.`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (EngulfWind.instance === undefined) {
      EngulfWind.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): EngulfWind {
    if (!EngulfWind.instance) {
      EngulfWind.instance = new EngulfWind();
    }
    return EngulfWind.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return EngulfWind.GetInstance() as T;
  }
}

export default EngulfWind;
