import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class BindSoul implements IAbility {
  private static instance: BindSoul;

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
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
bind soul
Syntax: c 'bind soul' <target>

Bind soul is a curious priest spell in that in landing, it may have one, or
multiple effects of which the priest has no choice in. It is said that it
can make a warrior less sure with his/her sword, weaker on the attack and/or
much slower than usual.
`;

    if (BindSoul.instance === undefined) {
      BindSoul.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): BindSoul {
    if (!BindSoul.instance) {
      BindSoul.instance = new BindSoul();
    }
    return BindSoul.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return BindSoul.GetInstance() as T;
  }
}

export default BindSoul;
