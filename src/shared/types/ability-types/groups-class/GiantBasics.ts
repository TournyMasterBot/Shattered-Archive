import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Berserk from "@shared/types/ability-types/skills/Berserk";
import Astrology from "@shared/types/ability-types/skills/Astrology";
import Charge from "@shared/types/ability-types/skills/Charge";
import Meditation from "@shared/types/ability-types/skills/Meditation";
import Attack from "../groups-spells/Attack";
import Benedictions from "@shared/types/ability-types/groups-spells/Benedictions";
import Maladictions from "../groups-spells/Maladictions";
import Weather from "../groups-spells/Weather";
import Combat from "../groups-spells/Combat";
import Enchantment from "../groups-spells/Enchantment";
import Creation from "../groups-spells/Creation";
import Detection from "../groups-spells/Detection";
import Protective from "../groups-spells/Protective";
import Enhancement from "@shared/types/ability-types/groups-spells/Enhancement";
import Curative from "@shared/types/ability-types/groups-spells/Curative";
import Healing from "../groups-spells/Healing";
import Transportation from "../groups-spells/Transportation";
import Beguiling from "../groups-spells/Beguiling";
import Illusion from "../groups-spells/Illusion";
import Weaponsmaster from "../groups-skills/Weaponsmaster";
import ServerCache from "@shared/cache/server-cache";

export class GiantBasics implements IAbilityGroup {
  static instance: GiantBasics;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.GiantBasics;
    this.abilityGroupType = AbilityGroupType.Basics;
    this.abilities = [
      ...Attack.GetInstance().abilities,
      ...Benedictions.GetInstance().abilities,
      ...Maladictions.GetInstance().abilities,
      ...Weather.GetInstance().abilities,
      ...Combat.GetInstance().abilities,
      ...Enchantment.GetInstance().abilities,
      ...Creation.GetInstance().abilities,
      ...Detection.GetInstance().abilities,
      ...Protective.GetInstance().abilities,
      ...Enhancement.GetInstance().abilities,
      ...Weaponsmaster.GetInstance().abilities,
      ...Curative.GetInstance().abilities,
      ...Healing.GetInstance().abilities,
      ...Transportation.GetInstance().abilities,
      ...Beguiling.GetInstance().abilities,
      ...Illusion.GetInstance().abilities,
      Berserk.GetInstance(),
      Astrology.GetInstance(),
      Charge.GetInstance(),
      Meditation.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): GiantBasics {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return GiantBasics.GetInstance() as T;
  }
}

export default GiantBasics;
