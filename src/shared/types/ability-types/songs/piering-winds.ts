import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class PiercingWinds implements IAbility {
  private static instance: PiercingWinds;

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
    this.name = "The Piercing Winds";
    this.abilityGroupType = AbilityGroupType.Songs;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
The Piercing Winds - Another powerful song that when sung, will summon 
savage winds and slash at all foes within the area. It can also provoke
people that are hidden within the room into action.
`;
    this.manualDescription = "* AoE damage to all in room who are not in your group";

    if (PiercingWinds.instance === undefined) {
      PiercingWinds.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): PiercingWinds {
    if (!PiercingWinds.instance) {
      PiercingWinds.instance = new PiercingWinds();
    }
    return PiercingWinds.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return PiercingWinds.GetInstance() as T;
  }
}

export default PiercingWinds;
