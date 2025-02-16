import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Berserk from "@shared/types/ability-types/skills/berserk";
import Astrology from "@shared/types/ability-types/skills/astrology";
import Charge from "@shared/types/ability-types/skills/charge";
import Meditation from "@shared/types/ability-types/skills/meditation";
import Attack from "../groups-spells/attack";
import Benedictions from "@shared/types/ability-types/groups-spells/benedictions";
import Maladictions from "../groups-spells/maladictions";
import Weather from "../groups-spells/weather";
import Combat from "../groups-spells/combat";
import Enchantment from "../groups-spells/enchantment";
import Creation from "../groups-spells/creation";
import Detection from "../groups-spells/detection";
import Protective from "../groups-spells/protective";
import Enhancement from "@shared/types/ability-types/groups-spells/enhancement";
import Curative from "@shared/types/ability-types/groups-spells/curative";
import Healing from "../groups-spells/healing";
import Transportation from "../groups-spells/transportation";
import Beguiling from "../groups-spells/beguiling";
import Illusion from "../groups-spells/illusion";
import Weaponsmaster from "../groups-skills/weaponsmaster";

export class GiantBasics implements IAbilityGroup {
  static instance: GiantBasics;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];

  constructor() {
    this.abilityGroup = AbilityGroup.GiantBasics;
    this.abilityGroupType = AbilityGroupType.Basics;
    this.abilities = [
      ...Attack.GetInstance().Get<Attack>().abilities,
      ...Benedictions.GetInstance().Get<Benedictions>().abilities,
      ...Maladictions.GetInstance().Get<Maladictions>().abilities,
      ...Weather.GetInstance().Get<Weather>().abilities,
      ...Combat.GetInstance().Get<Combat>().abilities,
      ...Enchantment.GetInstance().Get<Enchantment>().abilities,
      ...Creation.GetInstance().Get<Creation>().abilities,
      ...Detection.GetInstance().Get<Detection>().abilities,
      ...Protective.GetInstance().Get<Protective>().abilities,
      ...Enhancement.GetInstance().Get<Enhancement>().abilities,
      ...Weaponsmaster.GetInstance().Get<Weaponsmaster>().abilities,
      ...Curative.GetInstance().Get<Curative>().abilities,
      ...Healing.GetInstance().Get<Healing>().abilities,
      ...Transportation.GetInstance().Get<Transportation>().abilities,
      ...Beguiling.GetInstance().Get<Beguiling>().abilities,
      ...Illusion.GetInstance().Get<Illusion>().abilities,
      Berserk.GetInstance().Get(),
      Astrology.GetInstance().Get(),
      Charge.GetInstance().Get(),
      Meditation.GetInstance().Get(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): GiantBasics {
    if (!GiantBasics.instance) {
      GiantBasics.instance = new GiantBasics();
    }
    return GiantBasics.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return GiantBasics.GetInstance() as T;
  }
}

export default GiantBasics;
