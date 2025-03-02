import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class DragonKick implements IAbility {
  private static instance: DragonKick;

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
    this.helpFile = `
'DRAGON KICK'
Syntax:  dragon kick <target>
An especially powerful kicking skill, available only to dragons.
The command may be used without a target if combat is already in
progress.`;

    this.manualDescription = "";

    if (DragonKick.instance === undefined) {
      DragonKick.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): DragonKick {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return DragonKick.GetInstance() as T;
  }
}

export default DragonKick;
