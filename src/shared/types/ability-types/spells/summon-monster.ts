import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class SummonMonster implements IAbility {
  private static instance: SummonMonster;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `help wujen
The Wu Jen calls forth either a Rock or a Mud monster,
which will do their bidding until destroyed. The rock monster is made for
attacking, and will collapse when destroyed to deal damage to its killer. 
The mud monster is a defensive creature, made to absorb a great deal of
punishment before it is vanquished.`;
    this.manualDescription = ``;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (SummonMonster.instance === undefined) {
      SummonMonster.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): SummonMonster {
    if (!SummonMonster.instance) {
      SummonMonster.instance = new SummonMonster();
    }
    return SummonMonster.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return SummonMonster.GetInstance() as T;
  }
}

export default SummonMonster;
