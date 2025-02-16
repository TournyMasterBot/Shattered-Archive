import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class WeaponToss implements IAbility {
  private static instance: WeaponToss;

  name: string;
  helpFile: string;
  manualDescription?: string | undefined;
  duration?: number | undefined;
  effects?: SkillSpellEffects | undefined;
  group?: string | undefined;
  alternateKeyword?: string | undefined;
  recommendedHelpFileChanges?: string | undefined;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Weapon Toss";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
weapon toss
Syntax: wtoss

Weapon toss is an advanced disarm that carries the possibility of throwing a
disarmed weapon into the next room.
`;
  }

  // Method to get the single instance of the class
  public static GetInstance(): WeaponToss {
    if (!WeaponToss.instance) {
      WeaponToss.instance = new WeaponToss();
    }
    return WeaponToss.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return WeaponToss.GetInstance() as T;
  }
}

export default WeaponToss;
