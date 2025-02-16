import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class ShieldCrater implements IAbility {
  private static instance: ShieldCrater;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = "Shield Crater";
    this.helpFile = `
SHIELD CRATER

Syntax: cast 'shield crater' <target>

This spell allows the Eldritch to summon forth great power in order to 
weaken the target's resistance to damage from spells. This does not
reduce the target's resistance to spells, but increases damage from 
damage-dealing magics.

Groups containing this spell: ELDRITCH
        `;
    this.manualDescription = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (ShieldCrater.instance === undefined) {
      ShieldCrater.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): ShieldCrater {
    if (!ShieldCrater.instance) {
      ShieldCrater.instance = new ShieldCrater();
    }
    return ShieldCrater.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ShieldCrater.GetInstance() as T;
  }
}

export default ShieldCrater;
