import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class PraiseTheProphecy implements IAbility {
  private static instance: PraiseTheProphecy;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Praise the Prophecy";
    this.helpFile = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (PraiseTheProphecy.instance === undefined) {
      PraiseTheProphecy.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): PraiseTheProphecy {
    if (!PraiseTheProphecy.instance) {
      PraiseTheProphecy.instance = new PraiseTheProphecy();
    }
    return PraiseTheProphecy.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return PraiseTheProphecy.GetInstance() as T;
  }
}

export default PraiseTheProphecy;
