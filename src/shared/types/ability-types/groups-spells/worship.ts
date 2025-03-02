import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Crucify from "@shared/types/ability-types/spells/crucify";
import ImbueMount from "@shared/types/ability-types/spells/imbue-mount";
import HolySteed from "@shared/types/ability-types/spells/holy-steed";
import Devotion from "@shared/types/ability-types/spells/devotion";
import Inspire from "@shared/types/ability-types/spells/inspire";
import ServerCache from "@shared/cache/server-cache";

export class Worship implements IAbilityGroup {
  static instance: Worship;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.Worship;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      Crucify.GetInstance(),
      ImbueMount.GetInstance(),
      HolySteed.GetInstance(),
      Devotion.GetInstance(),
      Inspire.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): Worship {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Worship.GetInstance() as T;
  }
}

export default Worship;
