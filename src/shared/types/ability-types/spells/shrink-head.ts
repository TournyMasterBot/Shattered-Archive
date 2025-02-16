import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class ShrinkHead implements IAbility {
  private static instance: ShrinkHead;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = "Shrink Head";
    this.helpFile = `
shrink head
Powerful JuJu! Shrink head lets the shaman decapitate a fallen enemy
and instantaneously dry and shrink the head down to a handy pocket size.
By counting coup on the enemy in this way, the shaman preserves some
of the spirit power of the enemy. And the heads make fine conversation
pieces, as well.
        `;
    this.manualDescription = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (ShrinkHead.instance === undefined) {
      ShrinkHead.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): ShrinkHead {
    if (!ShrinkHead.instance) {
      ShrinkHead.instance = new ShrinkHead();
    }
    return ShrinkHead.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ShrinkHead.GetInstance() as T;
  }
}

export default ShrinkHead;
