import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import HealingDream from "@shared/types/ability-types/spells/HealingDream";
import Haze from "@shared/types/ability-types/spells/Haze";
import Recover from "@shared/types/ability-types/spells/Recover";
import FocusedAggression from "@shared/types/ability-types/spells/FocusedAggression";
import FakeIllness from "@shared/types/ability-types/spells/FakeIllness";
import AbandonHope from "@shared/types/ability-types/spells/AbandonHope";
import InfluenceConfidence from "@shared/types/ability-types/spells/InfluenceConfidence";
import Amnesia from "@shared/types/ability-types/spells/Amnesia";
import Distortion from "@shared/types/ability-types/spells/Distortion";
import ServerCache from "@shared/cache/server-cache";

export class Mentalism implements IAbilityGroup {
  static instance: Mentalism;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.Mentalism;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      HealingDream.GetInstance(),
      Haze.GetInstance(),
      Recover.GetInstance(),
      FocusedAggression.GetInstance(),
      FakeIllness.GetInstance(),
      AbandonHope.GetInstance(),
      InfluenceConfidence.GetInstance(),
      Amnesia.GetInstance(),
      Distortion.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): Mentalism {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Mentalism.GetInstance() as T;
  }
}

export default Mentalism;
