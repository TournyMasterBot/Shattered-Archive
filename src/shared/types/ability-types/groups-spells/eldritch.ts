import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Firebolt from "@shared/types/ability-types/spells/firebolt";
import HasteCrater from "@shared/types/ability-types/spells/haste-crater";
import NaturesGrip from "@shared/types/ability-types/spells/natures-grip";
import Root from "@shared/types/ability-types/spells/root";
import Scorch from "@shared/types/ability-types/spells/scorch";
import ShieldCrater from "@shared/types/ability-types/spells/shield-crater";
import SummonMountainbeast from "@shared/types/ability-types/spells/summon-mountainbeast";
import SummonStonelord from "@shared/types/ability-types/spells/summon-stonelord";
import SummonTree from "@shared/types/ability-types/spells/summon-tree";
import SunBlast from "@shared/types/ability-types/spells/sun-blast";

export class Eldritch implements IAbilityGroup {
  static instance: Eldritch;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name.toLowerCase();
    this.abilityGroup = AbilityGroup.Eldritch;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      Scorch.GetInstance().Get(),
      Firebolt.GetInstance().Get(),
      HasteCrater.GetInstance().Get(),
      NaturesGrip.GetInstance().Get(),
      SummonTree.GetInstance().Get(),
      ShieldCrater.GetInstance().Get(),
      SunBlast.GetInstance().Get(),
      Root.GetInstance().Get(),
      SummonStonelord.GetInstance().Get(),
      SummonMountainbeast.GetInstance().Get(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): Eldritch {
    if (!Eldritch.instance) {
      Eldritch.instance = new Eldritch();
    }
    return Eldritch.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Eldritch.GetInstance() as T;
  }
}

export default Eldritch;
