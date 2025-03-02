import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class AntimagicShell implements IAbility {
  private static instance: AntimagicShell;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  manualDescription?: string | undefined;
  duration?: number | undefined;
  effects?: SkillSpellEffects | undefined;
  group?: string | undefined;
  alternateKeyword?: string | undefined;
  recommendedHelpFileChanges?: string | undefined;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
ANTIMAGIC SHELL

Syntax: cast 'antimagic shell'

This protective spell prevents magical attacks from damaging the wearer. It
should be noted that rumours indicate that certain magical attacks are still
able to make it through the shell. It does not protect the wearer's armor
or equipment from being damaged by magical means.
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;
  }

  // Method to get the single instance of the class
  public static GetInstance(): AntimagicShell {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return AntimagicShell.GetInstance() as T;
  }
}

export default AntimagicShell;
