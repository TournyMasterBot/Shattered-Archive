import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Firebolt from "@shared/types/ability-types/spells/Firebolt";
import HasteCrater from "@shared/types/ability-types/spells/HasteCrater";
import NaturesGrip from "@shared/types/ability-types/spells/NaturesGrip";
import Root from "@shared/types/ability-types/spells/Root";
import Scorch from "@shared/types/ability-types/spells/Scorch";
import ShieldCrater from "@shared/types/ability-types/spells/ShieldCrater";
import SummonMountainbeast from "@shared/types/ability-types/spells/SummonMountainbeast";
import SummonStonelord from "@shared/types/ability-types/spells/SummonStonelord";
import SummonTree from "@shared/types/ability-types/spells/SummonTree";
import SunBlast from "@shared/types/ability-types/spells/SunBlast";
import ServerCache from "@shared/cache/server-cache";

export class Eldritch implements IAbilityGroup {
  static instance: Eldritch;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.Eldritch;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      Scorch.GetInstance(),
      Firebolt.GetInstance(),
      HasteCrater.GetInstance(),
      NaturesGrip.GetInstance(),
      SummonTree.GetInstance(),
      ShieldCrater.GetInstance(),
      SunBlast.GetInstance(),
      Root.GetInstance(),
      SummonStonelord.GetInstance(),
      SummonMountainbeast.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): Eldritch {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Eldritch.GetInstance() as T;
  }
}

export default Eldritch;
