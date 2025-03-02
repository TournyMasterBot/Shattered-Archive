import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class MortalShield implements IAbility {
  private static instance: MortalShield;

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
    this.name = this.constructor.name;
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `mortal shield
MORTAL SHIELD

Syntax: mshield <target>

A pirate can pull an innocent bystander in front of him or her to take the
oncoming attacks from an opponent. If the pirate flees the area, combat ends.
The only way a pirate can take credit for a kill when using mortal shield is if
he or she lands the killing blow.`;

    if (MortalShield.instance === undefined) {
      MortalShield.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): MortalShield {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return MortalShield.GetInstance() as T;
  }
}

export default MortalShield;
