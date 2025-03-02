import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class RunRiot implements IAbility {
  private static instance: RunRiot;

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
    this.abilityGroupType = AbilityGroupType.Songs;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
`;
    this.manualDescription = `
The lads are good and drunk tonight The lads are out to start a fight! OI OI!!

By singing a rousing song, the Brewmaster inspires his grouped allies to fight with more enthusiasm.

* +hit/dam
`;

    if (RunRiot.instance === undefined) {
      RunRiot.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): RunRiot {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return RunRiot.GetInstance() as T;
  }
}

export default RunRiot;
