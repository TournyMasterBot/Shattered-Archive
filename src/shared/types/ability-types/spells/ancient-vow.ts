import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class AncientVow implements IAbility {
  private static instance: AncientVow;

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
    this.name = "Ancient Vow";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
HELP 'ANCIENT VOW'

Syntax: cast 'ancient vow' <clan name>

This spell allows the battlemage to call upon a group of undead sentinels to
aid the caster against any specific clan. While they are highly fragile
against attack, they are powerful in delivering their own.

Groups containing this spell: Battlemagic

SEE ALSO: BATTLEMAGE, BATTLEMAGIC

Updated 03.21.2021
`;

    if (AncientVow.instance === undefined) {
      AncientVow.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): AncientVow {
    if (!AncientVow.instance) {
      AncientVow.instance = new AncientVow();
    }
    return AncientVow.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return AncientVow.GetInstance() as T;
  }
}

export default AncientVow;
